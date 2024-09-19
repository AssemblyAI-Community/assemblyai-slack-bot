import "dotenv/config";
import { App, BlockButtonAction, Context } from "@slack/bolt";
import Fuse from "fuse.js";
import {
  buildDiarizedTranscriptText,
  buildParagraphdTranscriptText,
  identifySpeakers,
  summarizeTranscript,
} from "./transcript";
import {
  buildQuestionActionsBlocks,
  buildTranscriptActionsBlocks,
  buildTranscriptMessage,
  languageInputBlock,
  languageOptions,
  transcribeBlocks,
  transcribeOptionsBlock,
  TranscriptActionsData,
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

app.action<BlockButtonAction>(
  { type: "block_actions", action_id: "transcribe-action" },
  async ({ ack, say, body, client, action, context }) => {
    try {
      await ack();
      const channelId = body.channel?.id!; // TODO, check
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
      const defaultText = "Working on it...";
      let replies = await client.conversations.replies({
        token: botToken,
        channel: channelId,
        ts: threadTs,
      });
      const fileName = replies.messages![0].files![0].name!; // TODO, make more robust
      let transcriptMessageData: TranscriptMessageData = {
        status: "Uploading file",
        text: defaultText,
        fileName,
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

      transcriptMessageData.text = defaultText;
      transcriptMessageData.status = "Transcribing";
      transcriptMessageData.id = transcript.id;
      await client.chat.update({
        token: botToken,
        channel: message.channel!,
        ts: message.ts!,
        ...buildTranscriptMessage(transcriptMessageData),
      });

      transcript = await aaiClient.transcripts.waitUntilReady(transcript.id);

      if (shouldAddSpeakerLabels) {
        const diarizedTranscriptText = buildDiarizedTranscriptText(transcript);
        transcriptMessageData.text = "Here is your transcript:";
        transcriptMessageData.status = "Completed";
        transcriptMessageData.transcript = diarizedTranscriptText;
        await client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
        });
      } else {
        transcriptMessageData.text = defaultText;
        transcriptMessageData.status = "Formatting";
        await client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
        });
        const transcriptText = await buildParagraphdTranscriptText(
          transcript,
          aaiClient,
        );
        transcriptMessageData.text = "Here is your transcript:";
        transcriptMessageData.status = "Completed";
        transcriptMessageData.transcript = transcriptText;
        await client.chat.update({
          token: botToken,
          channel: message.channel!,
          ts: message.ts!,
          ...buildTranscriptMessage(transcriptMessageData),
        });
      }

      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        token: botToken,
        user: body.user.id, // TODO, make more robust
        ...buildTranscriptActionsBlocks({
          hasSpeakerLabels: shouldAddSpeakerLabels,
          hasBeenSpeakerIdentified: false,
          hasBeenSummarized: false,
          transcriptId: transcript.id,
          messageTs: message.ts!,
          fileName,
        }),
      });
    } catch (error) {
      console.error(error);
    }
  },
);

app.action("language-options-action",
  async ({ ack }) => {
    try {
      await ack();
    } catch (error) {
      console.error(error);
    }
  });

app.action("transcribe-options-action",
  async ({ ack }) => {
    try {
      await ack();
    } catch (error) {
      console.error(error);
    }
  });

app.action<BlockButtonAction>(
  { type: "block_actions", action_id: "identify-speakers-action" },
  async ({ ack, say, body, client, action, context }) => {
    try {
      await ack();
      const channelId = body.container.channel_id as string; // TODO, check
      const threadTs = body.container.thread_ts as string; // TODO, check
      const actionsData = JSON.parse(action.value!) as TranscriptActionsData;
      const transcriptId = actionsData.transcriptId;
      const fileName = actionsData.fileName;
      const originalTranscriptMessageTs = actionsData.messageTs;
      const transcript = await aaiClient.transcripts.get(transcriptId);
      const transcriptText = buildDiarizedTranscriptText(transcript);
      const contextualizedTranscriptText = await identifySpeakers(
        transcriptText,
        aaiClient,
      );
      const transcriptMessageData: TranscriptMessageData = {
        text: "Here is your transcript with identified speakers:",
        status: "Completed",
        transcript: contextualizedTranscriptText.text,
        fileName,
      };
      await client.chat.update({
        token: botToken,
        channel: body.channel?.id!,
        ts: originalTranscriptMessageTs,
        ...buildTranscriptMessage(transcriptMessageData),
      });
      if (contextualizedTranscriptText.speakerIdentificationContext) {
        const identificationText =
          "Here is some context about how the speakers were identified:";
        await say!({
          // TODO, check
          thread_ts: threadTs,
          token: botToken,
          text: identificationText,
          blocks: [
            {
              type: "section",
              text: {
                type: "plain_text",
                text: identificationText,
              },
            },
            {
              type: "section",
              text: {
                type: "plain_text",
                text: contextualizedTranscriptText.speakerIdentificationContext,
              },
            },
          ],
        });

        await delay(2000);

        actionsData.hasBeenSpeakerIdentified = true;
        await client.chat.postEphemeral({
          channel: channelId,
          thread_ts: threadTs,
          token: botToken,
          user: body.user.id, // TODO, make more robust
          ...buildTranscriptActionsBlocks(actionsData),
        });
      }
    } catch (error) {
      console.error(error);
    }
  },
);

app.action<BlockButtonAction>(
  { type: "block_actions", action_id: "summarize-action" },
  async ({ ack, say, body, client, action, context }) => {
    try {
      await ack();
      const channelId = body.container.channel_id as string; // TODO, check
      const threadTs = body.container.thread_ts as string; // TODO, check
      const actionsData = JSON.parse(action.value!) as TranscriptActionsData;
      const transcriptId = actionsData.transcriptId;
      const summary = await summarizeTranscript(transcriptId, aaiClient);
      await say!({
        // TODO, check
        thread_ts: threadTs,
        token: botToken,
        text: "Here is a summary of the transcript:",
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: "Here is a summary of the transcript:",
            },
          },
          {
            type: "section",
            text: {
              type: "plain_text",
              text: summary,
            },
          },
        ],
      });

      await delay(2000);

      actionsData.hasBeenSummarized = true;
      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        token: botToken,
        user: body.user.id, // TODO, make more robust
        ...buildTranscriptActionsBlocks(actionsData),
      });
    } catch (error) {
      console.error(error);
    }
  },
);

app.action<BlockButtonAction>(
  { type: "block_actions", action_id: "ask-question-action" },
  async ({ ack, say, body, client, action, context }) => {
    try {
      await ack();
      const channelId = body.container.channel_id as string; // TODO, check
      const threadTs = body.container.thread_ts as string; // TODO, check
      const actionsData = JSON.parse(action.value!) as TranscriptActionsData;
      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        token: botToken,
        user: body.user.id, // TODO, make more robust
        ...buildQuestionActionsBlocks(actionsData),
      });
    } catch (error) {
      console.error(error);
    }
  },
);

app.action<BlockButtonAction>(
  { type: "block_actions", action_id: "submit-question-action" },
  async ({ ack, body, client, action }) => {
    try {
      await ack();
      const channelId = body.container.channel_id as string; // TODO, check
      const threadTs = body.container.thread_ts as string; // TODO, check
      const actionsData = JSON.parse(action.value!) as TranscriptActionsData;
      const question =
        body.state?.values["ask-question-input"]["ask-question-input"].value!;
      const lemurResponse = await aaiClient.lemur.task({
        transcript_ids: [actionsData.transcriptId],
        prompt: question,
        final_model: "anthropic/claude-3-5-sonnet",
      });

      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        token: botToken,
        user: body.user.id, // TODO, make more robust
        text: `You asked: ${question}\nResponse: ${lemurResponse.response}`,
      });

      await delay(2000);

      await client.chat.postEphemeral({
        channel: channelId,
        thread_ts: threadTs,
        token: botToken,
        user: body.user.id, // TODO, make more robust
        ...buildTranscriptActionsBlocks(actionsData),
      });
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

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
