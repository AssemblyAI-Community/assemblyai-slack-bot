import "dotenv/config";
import { App, Context } from "@slack/bolt";
import Fuse from "fuse.js";
import {
  buildDiarizedTranscriptText,
  buildParagraphdTranscriptText,
  identifySpeakers,
  summarizeTranscript,
} from "./transcript";
import {
  buildTranscriptMessage,
  languageInputBlock,
  languageOptions,
  transcribeBlocks,
  transcribeOptionsBlock,
  TranscriptMessageData,
} from "./blocks";
import { getAssemblyAIClient } from "./assemblyai-client";

const botToken = process.env.SLACK_BOT_TOKEN;

const app = new App({
  token: botToken,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const aaiClient = getAssemblyAIClient();

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

      const selectLanguage =
        body.state!.values[languageInputBlock.block_id!][
          languageInputBlock.element.action_id!
        ].selected_option?.value;
      const selectedOptions = body.state!.values[
        transcribeOptionsBlock.block_id!
      ][transcribeOptionsBlock.element.action_id!]!.selected_options?.map(
        (o) => o.value,
      );
      const shouldAddSpeakerLabels =
        selectedOptions?.includes("speaker_labels") || false;
      const shouldIdentifySpeakers =
        selectedOptions?.includes("identify_speakers") || false;
      const shouldGenerateSummary =
        selectedOptions?.includes("generate_summary") || false;
      const statuses = ["Uploading file", "Transcribing"];
      statuses.push(
        shouldAddSpeakerLabels && shouldIdentifySpeakers
          ? "Identifying speakers" // add speaker labels and identify speakers
          : "Formatting", // build transcript by paragraphs
      );
      if (shouldGenerateSummary) statuses.push("Generating summary");
      statuses.push("Completed");
      const getTextAndStatus = () => {
        const status = statuses.shift()!;
        const text =
          statuses.length > 0 ? "Working on it..." : "Here is the transcript:";
        return { text, status };
      };
      let text: string;
      let status: string;

      let replies = await client.conversations.replies({
        token: botToken,
        channel: channelId,
        ts: threadTs,
      });
      const fileName = replies.messages![0].files![0].name!; // TODO, make more robust
      const footer = `Transcript for ${fileName}`;
      ({ text, status } = getTextAndStatus());
      let transcriptMessageData: TranscriptMessageData = {
        text,
        fileName,
        status,
      };
      let message = await say!({
        // TODO, check
        thread_ts: threadTs,
        token: botToken,
        ...buildTranscriptMessage(transcriptMessageData),
      });
      const download = await downloadSlackFile(
        replies.messages![0].files![0].url_private_download!,
        context,
      );

      const uploadedFileUrl = await aaiClient.files.upload(download.body!); // TODO: check

      let transcript = await aaiClient.transcripts.submit({
        audio_url: uploadedFileUrl,
        language_code: selectLanguage ?? null,
        language_detection: selectLanguage == null ? true : false,
        speaker_labels: shouldAddSpeakerLabels,
      });

      ({ text, status } = getTextAndStatus());
      transcriptMessageData.text = text;
      transcriptMessageData.status = status;
      transcriptMessageData.id = transcript.id;
      client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        ...buildTranscriptMessage(transcriptMessageData),
      });

      transcript = await aaiClient.transcripts.waitUntilReady(transcript.id);

      if (shouldAddSpeakerLabels) {
        const diarizedTranscriptText =
          await buildDiarizedTranscriptText(transcript);
        ({ text, status } = getTextAndStatus());
        transcriptMessageData.text = text;
        transcriptMessageData.status = status;
        client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
        });
        if (shouldIdentifySpeakers) {
          const contextualizedTranscriptText = await identifySpeakers(
            diarizedTranscriptText,
            aaiClient,
          );
          ({ text, status } = getTextAndStatus());
          transcriptMessageData.text = text;
          transcriptMessageData.status = status;
          transcriptMessageData.transcript = contextualizedTranscriptText.text;
          transcriptMessageData.speakerIdentificationContext =
            contextualizedTranscriptText.speakerIdentificationContext;
          client.chat.update({
            token: botToken,
            channel: message.channel!,
            ts: message.ts!,
            ...buildTranscriptMessage(transcriptMessageData),
          });
        }
      } else {
        const transcriptText = await buildParagraphdTranscriptText(
          transcript,
          aaiClient,
        );
        ({ text, status } = getTextAndStatus());
        transcriptMessageData.text = text;
        transcriptMessageData.status = status;
        transcriptMessageData.transcript = transcriptText;
        client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
        });
      }
      if (shouldGenerateSummary) {
        const summary = await summarizeTranscript(transcript, aaiClient);
        ({ text, status } = getTextAndStatus());
        transcriptMessageData.text = text;
        transcriptMessageData.status = status;
        transcriptMessageData.summary = summary;
        client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
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
