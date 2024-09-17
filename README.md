# AssemblyAI Slack Bot

You cannot develop using the same Slack app at one time, so each contributor should create their own Slack app.
You can use the [manifest.json](./manifest.json) to configure your Slack app, but make sure to replace `https://2cf5-72-221-14-208.ngrok-free.app` with your own public URL.

## Set up

Configure `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `ASSEMBLYAI_API_KEY` in *.env*, see *.env.sample* as an example.
You can learn [how to get the Slack tokens in the getting started guide](https://tools.slack.dev/bolt-js/tutorial/getting-started-http/#tokens-and-installing-apps).

Install dependencies:
```bash
npm install
```

Run the bot:
```bash
npm run start
# or
npm run watch
```

## Useful links:
- [Getting started with Bolt for JavaScript and HTTP](https://tools.slack.dev/bolt-js/tutorial/getting-started-http/)
- [Bolt JS](https://github.com/slackapi/bolt-js)