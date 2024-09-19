import {
  ActionsBlockElement,
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
    ],
  },
  label: {
    type: "plain_text",
    text: "Options",
    emoji: false,
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

export type TranscriptActionsData = {
  hasSpeakerLabels: boolean;
  hasBeenSpeakerIdentified: boolean;
  hasBeenSummarized: boolean;
  transcriptId: string;
  messageTs: string;
  fileName: string;
};

export function buildQuestionActionsBlocks(
  actionsData: TranscriptActionsData,
): Partial<ChatUpdateArguments> {
  const value = JSON.stringify(actionsData);
  const text = "Ask your question";
  return {
    text,
    blocks: [
      {
        type: "input",
        block_id: "ask-question-input",
        element: {
          type: "plain_text_input",
          action_id: "ask-question-input",
        },
        label: {
          type: "plain_text",
          text: text,
          emoji: false,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Submit",
              emoji: true,
            },
            value,
            action_id: "submit-question-action",
          },
        ],
      },
    ],
  };
}

export function buildTranscriptActionsBlocks(
  actionsData: TranscriptActionsData,
): Partial<ChatUpdateArguments> {
  const value = JSON.stringify(actionsData);
  const elements: ActionsBlockElement[] = [];
  const text = "What would you like to do next?";
  if (actionsData.hasSpeakerLabels && !actionsData.hasBeenSpeakerIdentified) {
    elements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Identify Speakers",
        emoji: false,
      },
      value,
      action_id: "identify-speakers-action",
    });
  }
  if (!actionsData.hasBeenSummarized) {
    elements.push(
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "Summarize",
          emoji: false,
        },
        value,
        action_id: "summarize-action",
      });
  }
  return {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "plain_text",
          text,
        },
      },
      {
        type: "actions",
        elements: [
          ...elements,
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Ask a question",
              emoji: false,
            },
            value,
            action_id: "ask-question-action",
          },
        ],
      },
    ],
  };
}

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
