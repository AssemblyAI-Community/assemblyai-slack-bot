import { AssemblyAI, Transcript } from "assemblyai";

export type ContextualizedTranscriptText = {
  text: string;
  speakerIdentificationContext?: string | null;
};

export function buildDiarizedTranscriptText(
  transcript: Transcript,
): string {
  let text = "";
  const includeHourInTimestamp = transcript.audio_duration! > 3600;
  for (let utterance of transcript.utterances!) {
    text += `Speaker ${utterance.speaker} (${formatTimestamp(utterance.start, includeHourInTimestamp)}): ${utterance.text}\n`;
  }

  return text;
}

export async function identifySpeakers(
  diarizedTranscriptText: string,
  client: AssemblyAI,
): Promise<ContextualizedTranscriptText> {
  let prompt = `
Be succinct and don't include a preamble.
Please identify the speakers in the following transcript.
Return a JSON object with two keys:
1. "context": Explanation of how you deduced the speaker names.
2. "speakers": An object with the speaker ID as the key and the identified speaker name as the value.
   If you cannot identify the speaker or are not certain, set the original speaker ID as the value.

Transcript:
${diarizedTranscriptText}"
  `;
  const taskResponse = await client.lemur.task({
    prompt,
    input_text: diarizedTranscriptText,
    final_model: "anthropic/claude-3-5-sonnet",
  });
  try {
    console.log("taskResponse", taskResponse);
    let jsonResponse = JSON.parse(taskResponse.response);

    for (const key in jsonResponse) {
      const speakerIdPrefix = key.startsWith("Speaker ") ? "" : "Speaker ";
      diarizedTranscriptText = diarizedTranscriptText.replaceAll(
        `${speakerIdPrefix}${key}`,
        `${jsonResponse[key]}`,
      );
    }
    return {
      text: diarizedTranscriptText,
      speakerIdentificationContext: jsonResponse.context,
    };
  } catch (err) {
    console.error(err);
  }
  return {
    text: diarizedTranscriptText,
    speakerIdentificationContext:
      "Something went wrong trying to identify the speakers. Please try again.",
  };
}

export async function buildParagraphdTranscriptText(
  transcript: Transcript,
  client: AssemblyAI,
): Promise<string> {
  let text = "";
  const paragraphsResponse = await client.transcripts.paragraphs(transcript.id);
  for (let paragraph of paragraphsResponse.paragraphs) {
    text += `${paragraph.text}\n\n`;
  }

  return text;
}

function formatTimestamp(
  start: number,
  includeHourInTimestamp: boolean,
): string {
  start = start / 1000; // Convert to seconds
  const hours = Math.floor(start / 3600);
  const minutes = Math.floor((start % 3600) / 60);
  const seconds = Math.floor(start % 60);

  const formattedHours = hours.toString().padStart(2, "0");
  const formattedMinutes = minutes.toString().padStart(2, "0");
  const formattedSeconds = seconds.toString().padStart(2, "0");

  return includeHourInTimestamp
    ? `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
    : `${formattedMinutes}:${formattedSeconds}`;
}

export async function summarizeTranscript(
  transcript: Transcript,
  client: AssemblyAI,
): Promise<string> {
  const summaryResponse = await client.lemur.summary({
    transcript_ids: [transcript.id],
    final_model: "anthropic/claude-3-5-sonnet",
  });
  return summaryResponse.response;
}
