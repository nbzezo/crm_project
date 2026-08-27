import type { Database } from 'better-sqlite3';

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
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(SETTINGS_KEY, JSON.stringify(templates));
}
