import { Block, InputBlock, KnownBlock, PlainTextOption } from "@slack/bolt";

export const languageOptions = Object.entries({
  en: "English (global)",
  en_au: "English (Australian)",
  en_uk: "English (British)",
  en_us: "English (US)",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  af: "Afrikaans",
  sq: "Albanian",
  am: "Amharic",
  ar: "Arabic",
  hy: "Armenian",
  as: "Assamese",
  az: "Azerbaijani",
  ba: "Bashkir",
  eu: "Basque",
  be: "Belarusian",
  bn: "Bengali",
  bs: "Bosnian",
  br: "Breton",
  bg: "Bulgarian",
  my: "Burmese",
  ca: "Catalan",
  zh: "Chinese",
  hr: "Croatian",
  cs: "Czech",
  da: "Danish",
  et: "Estonian",
  fo: "Faroese",
  fi: "Finnish",
  gl: "Galician",
  ka: "Georgian",
  el: "Greek",
  gu: "Gujarati",
  ht: "Haitian",
  ha: "Hausa",
  haw: "Hawaiian",
  he: "Hebrew",
  hi: "Hindi",
  hu: "Hungarian",
  is: "Icelandic",
  id: "Indonesian",
  ja: "Japanese",
  jw: "Javanese",
  kn: "Kannada",
  kk: "Kazakh",
  km: "Khmer",
  ko: "Korean",
  lo: "Lao",
  la: "Latin",
  lv: "Latvian",
  ln: "Lingala",
  lt: "Lithuanian",
  lb: "Luxembourgish",
  mk: "Macedonian",
  mg: "Malagasy",
  ms: "Malay",
  ml: "Malayalam",
  mt: "Maltese",
  mi: "Maori",
  mr: "Marathi",
  mn: "Mongolian",
  ne: "Nepali",
  no: "Norwegian",
  nn: "Norwegian Nynorsk",
  oc: "Occitan",
  pa: "Panjabi",
  ps: "Pashto",
  fa: "Persian",
  pl: "Polish",
  ro: "Romanian",
  ru: "Russian",
  sa: "Sanskrit",
  sr: "Serbian",
  sn: "Shona",
  sd: "Sindhi",
  si: "Sinhala",
  sk: "Slovak",
  sl: "Slovenian",
  so: "Somali",
  su: "Sundanese",
  sw: "Swahili",
  sv: "Swedish",
  tl: "Tagalog",
  tg: "Tajik",
  ta: "Tamil",
  tt: "Tatar",
  te: "Telugu",
  th: "Thai",
  bo: "Tibetan",
  tr: "Turkish",
  tk: "Turkmen",
  uk: "Ukrainian",
  ur: "Urdu",
  uz: "Uzbek",
  vi: "Vietnamese",
  cy: "Welsh",
  yi: "Yiddish",
  yo: "Yoruba"
}).map(([languageCode, label]) => (
  {
    "text": {
      "type": "plain_text",
      "text": label,
      "emoji": false
    },
    "value": languageCode
  } as PlainTextOption
));

export const languageInputBlock: InputBlock = {
  "type": "input",
  "block_id": "language-input",
  "hint": {
    text: "If you leave it blank and we'll try to detect it for you.",
    type: "plain_text",
    "emoji": false
  },
  optional: true,
  "element": {
    action_id: "language-options-action",
    "type": "external_select",
    "placeholder": {
      "type": "plain_text",
      "text": "Select a language",
      "emoji": false
    },
    "min_query_length": 1
  },
  "label": {
    "type": "plain_text",
    "text": "What language is the file?",
    "emoji": false
  }
} as const;

export const transcribeOptionsBlock: InputBlock =
  {
    "type": "input",
    "block_id": "transcribe-options-input",
    "element": {
      action_id: "transcribe-options-action",
      "type": "checkboxes",
      "options": [
        {
          "text": {
            "type": "plain_text",
            "text": "Add speaker labels",
            "emoji": false
          },
          "value": "speaker_labels"
        },
        {
          "text": {
            "type": "plain_text",
            "text": "Identify speakers",
            "emoji": false
          },
          "value": "identify_speakers"
        },
        {
          "text": {
            "type": "plain_text",
            "text": "Generate summary",
            "emoji": false
          },
          "value": "generate_summary"
        }
      ]
    },
    "label": {
      "type": "plain_text",
      "text": "Options",
      "emoji": true
    }
  } as const;

export const transcribeBlocks: (KnownBlock | Block)[] = [
  languageInputBlock,
  transcribeOptionsBlock,
  {
    "type": "actions",
    "elements": [
      {
        "type": "button",
        "text": {
          "type": "plain_text",
          "text": "Transcribe"
        },
        "action_id": "transcribe-action"
      }
    ]
  }
];