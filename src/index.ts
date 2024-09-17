import "dotenv/config";
import { App, BlockAction, BlockElementAction, Context } from "@slack/bolt";
import Fuse from "fuse.js";
import { AssemblyAI } from "assemblyai";
import { buildTranscriptText } from "./transcript";
import {
  languageInputBlock,
  languageOptions,
  transcribeBlocks,
  transcribeOptionsBlock,
} from "./blocks";

const botToken = process.env.SLACK_BOT_TOKEN;

const app = new App({
  token: botToken,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const aaiClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
  // proxyman proxy
  baseUrl: "http://localhost:10000",
});

// All the room in the world for your code
app.event("app_home_opened", async ({ event, client, context }) => {
  try {
    /* view.publish is the method that your app uses to push a view to the Home tab */
    const result = await client.views.publish({
      /* the user that opened your app's app home */
      user_id: event.user,

      /* the view object that appears in the app home*/
      view: {
        type: "home",
        callback_id: "home_view",

        /* body of the view */
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Welcome to your _App's Home tab_* :tada:",
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "This button won't do much for now but you can set up a listener for it using the `actions()` method and passing its unique `action_id`. See an example in the `examples` folder within your Bolt app.",
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Click me!",
                },
              },
            ],
          },
        ],
      },
    });
  } catch (error) {
    console.error(error);
  }
});

// Listen for slash commands
app.command("/transcribe", async ({ ack, respond }) => {
  try {
    await ack();
    await respond("Responding to the sample command!");
  } catch (error) {
    console.error(error);
  }
});

app.options("language-options-action", async ({ ack, payload }) => {
  const fuse = new Fuse(languageOptions, {
    keys: ["text.text"],
    shouldSort: true,
    threshold: 0.5,
  });

  const filteredOptions = fuse.search(payload.value);

  await ack({
    options: filteredOptions.map((option) => option.item).slice(0, 10),
  });
});

app.action(
  { type: "block_actions", action_id: "transcribe-action" },
  async ({ ack, say, body, client, action, context }) => {
    try {
      await ack();
      const channelId = body.container.channel_id as string; // TODO, check
      const threadTs = body.container.thread_ts as string; // TODO, check
      let replies = await client.conversations.replies({
        token: botToken,
        channel: channelId,
        ts: threadTs,
      });
      const fileName = replies.messages![0].files![0].name; // TODO, make more robust
      const footer = `Transcript for ${fileName}`;
      const defaultText = `Working on it...`;
      let message = await say!({
        // TODO, check
        text: defaultText,
        thread_ts: threadTs,
      });
      const download = await downloadSlackFile(
        replies.messages![0].files![0].url_private_download!,
        context,
      );

      client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        text: defaultText,
        attachments: [
          {
            footer,
            fields: [
              {
                title: "Status",
                value: "Uploading file",
                short: true,
              },
            ],
          },
        ],
      });

      const uploadedFileUrl = await aaiClient.files.upload(download.body!); // TODO: check

      const selectLanguage =
        body.state!.values[languageInputBlock.block_id!][
          languageInputBlock.element.action_id!
        ].selected_option?.value;
      const selectedOptions = body.state!.values[
        transcribeOptionsBlock.block_id!
      ][transcribeOptionsBlock.element.action_id!]!.selected_options?.map(
        (o) => o.value,
      );
      const speakerLabels =
        selectedOptions?.includes("speaker_labels") || false;
      const identifySpeakers =
        selectedOptions?.includes("identify_speakers") || false;
      const generateSummary =
        selectedOptions?.includes("generate_summary") || false;

      let transcript = await aaiClient.transcripts.submit({
        audio_url: uploadedFileUrl,
        language_code: selectLanguage ?? null,
        language_detection: selectLanguage == null ? true : false,
        speaker_labels: speakerLabels,
      });
      const transcriptIdField = {
        title: "ID",
        value: transcript.id,
        short: true,
      };
      client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        text: defaultText,
        attachments: [
          {
            footer,
            fields: [
              {
                title: "Status",
                value: "Transcribing",
                short: true,
              },
              transcriptIdField,
            ],
          },
        ],
      });

      transcript = await aaiClient.transcripts.waitUntilReady(transcript.id);

      client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        text: defaultText,
        attachments: [
          {
            footer,
            fields: [
              {
                title: "Status",
                value: "Formatting",
                short: true,
              },
              transcriptIdField,
            ],
          },
        ],
      });
      const contextualizedTranscriptText = await buildTranscriptText(
        "",
        transcript,
        aaiClient,
      );
      console.log("transcript", contextualizedTranscriptText.text);
      console.log("context", contextualizedTranscriptText.context);
      client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        text: "Here is the transcript:",
        attachments: [
          {
            text: contextualizedTranscriptText.text,
            footer,
            fields: [
              {
                title: "Status",
                value: "Completed",
                short: true,
              },
              transcriptIdField,
            ],
          },
        ],
      });
      if (contextualizedTranscriptText.context) {
        await say!({
          text: contextualizedTranscriptText.context,
          thread_ts: threadTs,
        });
      }
    } catch (error) {
      console.error(error);
    }
  },
);

// subscribe to 'app_mention' event in your App config
// need app_mentions:read and chat:write scopes
app.event("app_mention", async ({ event, context, client, say }) => {
  try {
    await client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: "Fill out these fields to transcribe your file",
      user: event.user!, // TODO, make more robust
      blocks: transcribeBlocks,
    });
  } catch (error) {
    console.error(error);
  }
});

async function downloadSlackFile(url: string, context: Context) {
  return await fetch(url, {
    headers: {
      Authorization: `Bearer ${context.botToken}`,
    },
  });
}

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
