import type { Database } from 'better-sqlite3';
import { AI_PROVIDERS, type AiProviderName } from './types.ts';

/**
 * Mau prompt de tom tat/xu ly ban ghi am — nguoi dung tu cau hinh trong Cai dat
 * (AiSettings.tsx). Luu theo dung khuon `app_settings` da dung cho `handover.*`
 * (xem handoverService.ts) — mot danh sach sua-cung-luc-luu-mot-lan, khong can
 * bang rieng vi khong co quan he khoa ngoai nao can giu.
 */
export interface VoicePromptTemplate {
  key: string;
  name: string;
  prompt: string;
}

const SETTINGS_KEY = 'ai.voice_prompt_templates';

export function getVoicePromptTemplates(db: Database): VoicePromptTemplate[] {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(SETTINGS_KEY) as
    { value: string } | undefined;
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as unknown;
    return Array.isArray(parsed) ? (parsed as VoicePromptTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveVoicePromptTemplates(db: Database, templates: VoicePromptTemplate[]): void {
  writeSetting(db, SETTINGS_KEY, templates);
}

const MODEL_SETTINGS_KEY = 'ai.voice_model';

/**
 * Model dung cho speech-to-text (ghi am -> van ban).
 *
 * Ca hai truong deu null = de gateway tu chon nha cung cap dau tien co model
 * doc duoc audio. Khi chon tay, gateway GHIM CUNG provider + model: khong
 * fallback sang nha cung cap khac va khong loc theo bang nang luc — bang do
 * chi suy doan tu ten model (providers.ts) nen tung chan nham nhung model doc
 * duoc audio, khien viec chuyen ghi am tra ve 502 "khong doc duoc tep dinh kem".
 */
export interface VoiceModelSetting {
  provider: AiProviderName | null;
  model: string | null;
}

const AUTO_VOICE_MODEL: VoiceModelSetting = { provider: null, model: null };

export function getVoiceModel(db: Database): VoiceModelSetting {
  const parsed = readSetting(db, MODEL_SETTINGS_KEY);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return AUTO_VOICE_MODEL;
  const value = parsed as Record<string, unknown>;
  const provider = AI_PROVIDERS.includes(value.provider as AiProviderName)
    ? (value.provider as AiProviderName)
    : null;
  const model = typeof value.model === 'string' && value.model.trim() ? value.model.trim() : null;
  return provider && model ? { provider, model } : AUTO_VOICE_MODEL;
}

export function saveVoiceModel(db: Database, value: VoiceModelSetting): void {
  writeSetting(db, MODEL_SETTINGS_KEY, value.provider && value.model ? value : AUTO_VOICE_MODEL);
}

function readSetting(db: Database, key: string): unknown {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
    { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

function writeSetting(db: Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value));
}
