import { AssemblyAI, Transcript } from "assemblyai";

export type ContextualizedTranscriptText = {
  text: string;
  context?: string | null;
};

export async function buildTranscriptText(
  userPrompt: string,
  transcript: Transcript,
  client: AssemblyAI
): Promise<ContextualizedTranscriptText> {
  const speakers = new Set();
  for (let utterance of transcript.utterances!) {
    speakers.add(utterance.speaker);
  }
  if (speakers.size > 1) {
    return await buildDiarizedText(userPrompt, transcript, client);
  }
  else {
    return await buildParagraphdText(transcript, client);
  }
}

async function buildDiarizedText(
  userPrompt: string,
  transcript: Transcript,
  client: AssemblyAI
): Promise<ContextualizedTranscriptText> {
  let text = '';
  const includeHourInTimestamp = transcript.audio_duration! > 3600;
  for (let utterance of transcript.utterances!) {
    text +=
      `Speaker ${utterance.speaker} (${formatTimestamp(utterance.start, includeHourInTimestamp)}): ${utterance.text}\n`;
  }

  return await identifySpeakers(userPrompt, text, client);
}

async function identifySpeakers(
  userPrompt: string,
  text: string,
  client: AssemblyAI
): Promise<ContextualizedTranscriptText> {
  let prompt = `
Be succinct and don't include a preamble.
Please identify the speakers in the following transcript.
Return a JSON object with two keys:
1. "context": Explanation of how you deduced the speaker names.
2. "speakers": An object with the speaker ID as the key and the identified speaker name as the value.
   If you cannot identify the speaker or are not certain, set the original speaker ID as the value.

Transcript:
${text}"
  `;
  const taskResponse = await client.lemur.task({
    prompt,
    input_text: text,
    context: `Here is the original user prompt that triggered this task: ${userPrompt}`,
    final_model: "anthropic/claude-3-5-sonnet"
  });
  try {
    console.log("taskResponse", taskResponse);
    let jsonResponse = JSON.parse(taskResponse.response);

    for (const key in jsonResponse) {
      const speakerIdPrefix = key.startsWith("Speaker ") ? "" : "Speaker ";
      text = text.replaceAll(`${speakerIdPrefix}${key}`, `${jsonResponse[key]}`);
    }
    return { text, context: jsonResponse.context };
  } catch (err) {
    console.error(err);
  }
  return { text };
}

async function buildParagraphdText(transcript: Transcript, client: AssemblyAI): Promise<ContextualizedTranscriptText> {
  let text = '';
  const paragraphsResponse = await client.transcripts.paragraphs(transcript.id);
  for (let paragraph of paragraphsResponse.paragraphs) {
    text += `${paragraph.text}\n\n`;
  }

  return { text };
}

function formatTimestamp(start: number, includeHourInTimestamp: boolean): string {
  start = start / 1000; // Convert to seconds
  const hours = Math.floor(start / 3600);
  const minutes = Math.floor((start % 3600) / 60);
  const seconds = Math.floor(start % 60);

  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = seconds.toString().padStart(2, '0');

  return includeHourInTimestamp ?
    `${formattedHours}:${formattedMinutes}:${formattedSeconds}` :
    `${formattedMinutes}:${formattedSeconds}`;
}
