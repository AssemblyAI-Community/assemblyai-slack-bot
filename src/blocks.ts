import {
  Block,
  InputBlock,
  KnownBlock,
  MessageAttachmentField,
  PlainTextOption,
} from "@slack/bolt";
import { ChatUpdateArguments } from "@slack/web-api";
import { supportedLanguages } from "./languages";

export const languageOptions = Object.entries(supportedLanguages).map(
  ([languageCode, label]) =>
    ({
      text: {
        type: "plain_text",
        text: label,
        emoji: false,
      },
      value: languageCode,
    }) as PlainTextOption,
);

export const languageInputBlock: InputBlock = {
  type: "input",
  block_id: "language-input",
  hint: {
    text: "If you leave it blank and we'll try to detect it for you.",
    type: "plain_text",
    emoji: false,
  },
  optional: true,
  element: {
    action_id: "language-options-action",
    type: "external_select",
    placeholder: {
      type: "plain_text",
      text: "Select a language",
      emoji: false,
    },
    min_query_length: 1,
  },
  label: {
    type: "plain_text",
    text: "What language is the file?",
    emoji: false,
  },
} as const;

export const transcribeOptionsBlock: InputBlock = {
  type: "input",
  block_id: "transcribe-options-input",
  element: {
    action_id: "transcribe-options-action",
    type: "checkboxes",
    options: [
      {
        text: {
          type: "plain_text",
          text: "Add speaker labels",
          emoji: false,
        },
        value: "speaker_labels",
      },
      {
        text: {
          type: "plain_text",
          text: "Identify speakers",
          emoji: false,
        },
        value: "identify_speakers",
      },
      {
        text: {
          type: "plain_text",
          text: "Generate summary",
          emoji: false,
        },
        value: "generate_summary",
      },
    ],
  },
  label: {
    type: "plain_text",
    text: "Options",
    emoji: true,
  },
} as const;

export const transcribeBlocks: (KnownBlock | Block)[] = [
  languageInputBlock,
  transcribeOptionsBlock,
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Transcribe",
        },
        action_id: "transcribe-action",
      },
    ],
  },
] as const;

export type TranscriptMessageData = {
  text: string;
  fileName: string;
  status: string;
  id?: string;
  transcript?: string;
  speakerIdentificationContext?: string | null;
  summary?: string;
};

export function buildTranscriptMessage({
  text,
  fileName,
  status,
  id,
  transcript,
  speakerIdentificationContext,
  summary,
}: TranscriptMessageData): Partial<ChatUpdateArguments> {
  const isCompleted = status === "Completed";
  const fields: MessageAttachmentField[] = [
    {
      title: "Status",
      value: status,
      short: true,
    },
  ];
  if (id) {
    fields.push({
      title: "ID",
      value: id,
      short: true,
    });
  }
  if (isCompleted && speakerIdentificationContext) {
    fields.push({
      title: "Speaker Identification Context",
      value: speakerIdentificationContext,
      short: false,
    });
  }
  if (isCompleted && summary) {
    fields.push({
      title: "Summary",
      value: summary,
      short: false,
    });
  }
  return {
    text,
    attachments: [
      {
        text: isCompleted ? transcript : "",
        fields: fields,
        footer: `Transcript for ${fileName}`,
      },
    ],
  };
}
