import "dotenv/config";
import { App, MessageAttachment } from "@slack/bolt";
import { AssemblyAI, FileUploadData } from "assemblyai";
import { buildTranscriptText } from "./transcript";

const botToken = process.env.SLACK_BOT_TOKEN;

const app = new App({
  token: botToken,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const aaiClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
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
app.command("/transcribe", async ({ ack, respond, ...stuff }) => {
  try {
    console.log(stuff);
    await ack();
    await respond("Responding to the sample command!");
  } catch (error) {
    console.error(error);
  }
});

// subscribe to 'app_mention' event in your App config
// need app_mentions:read and chat:write scopes
app.event("app_mention", async ({ event, context, client, say, ...stuff }) => {
  try {
    let replies = await app.client.conversations.replies({
      token: botToken,
      channel: event.channel,
      ts: event.thread_ts! // TODO, check
    });
    const download = await fetch(replies.messages![0].files![0].url_private_download!, { // TODO: check
      headers: {
        'Authorization': `Bearer ${context.botToken}`
      },
    });
    const uploadedFileUrl = await aaiClient.files.upload(download.body!); // TODO: check
    let transcript = await aaiClient.transcripts.submit({
      audio_url: uploadedFileUrl,
      language_detection: true,
      speaker_labels: true,
    });
    transcript = await aaiClient.transcripts.waitUntilReady(transcript.id);
    const contextualizedTranscriptText = await buildTranscriptText(event.text, transcript, aaiClient);
    console.log("transcript", contextualizedTranscriptText.text);
    console.log("context", contextualizedTranscriptText.context);
    await say({
      text: 'Here is the transcript:',
      attachments: [{
        text: contextualizedTranscriptText.text,
        footer: `Transcript for ${replies.messages![0].files![0].name}`
      }],
      thread_ts: event.thread_ts!
    });
    if (contextualizedTranscriptText.context) {
      await say({
        text: contextualizedTranscriptText.context,
        thread_ts: event.thread_ts!
      });
    }
  } catch (error) {
    console.error(error);
  }
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("⚡️ Bolt app is running!");
})();
