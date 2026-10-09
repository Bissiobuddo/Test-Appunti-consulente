import { TRANSCRIPTION_PRESETS, type TranscriptionProvider, type TranscriptionService } from "../../shared/transcription.ts";

// Chiavi API dell'app Android, salvate solo su questo dispositivo.
export interface DeviceSettings {
  claudeKey: string;
  transcriptionProvider: TranscriptionProvider;
  transcriptionKey: string;
}

const KEY = "appunti-settings";
const DEFAULTS: DeviceSettings = { claudeKey: "", transcriptionProvider: "openai", transcriptionKey: "" };

export function loadSettings(): DeviceSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: DeviceSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function transcriptionService(s: DeviceSettings): TranscriptionService {
  const preset = TRANSCRIPTION_PRESETS[s.transcriptionProvider];
  return { url: preset.url, model: preset.model, apiKey: s.transcriptionKey };
}
