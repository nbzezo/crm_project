import type { Database } from 'better-sqlite3';

/**
 * Phien chat voi Tro ly AI — tao, doc, xoa, va gioi han so phien giu lai.
 *
 * Gioi han nam o day chu khong phai trong SQL (khong co trigger LIMIT goi gon),
 * va dat dung MOT cho de sau nay doc lai con biet quy tac o dau.
 */

/** So phien gan nhat duoc giu. Cu hon se bi xoa cung toan bo tin nhan. */
export const MAX_SESSIONS = 20;

/** Do dai toi da cua tieu de tu sinh tu cau hoi dau tien. */
const TITLE_MAX = 80;

export type ChatScope = 'crm' | 'documents' | 'all';
export type ChatRole = 'user' | 'assistant';

export interface ChatSessionRow {
  id: number;
  title: string;
  scope: ChatScope;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatMessageRow {
  id: number;
  session_id: number;
  role: ChatRole;
  content: string;
  meta: unknown;
  created_at: string;
}

interface RawMessage extends Omit<ChatMessageRow, 'meta'> {
  meta_json: string | null;
}

function parseMeta(row: RawMessage): ChatMessageRow {
  const { meta_json, ...rest } = row;
  let meta: unknown = null;
  if (meta_json) {
    try {
      meta = JSON.parse(meta_json);
    } catch {
      /* Mot ban ghi hong khong duoc lam hong ca phien — bo qua rieng no. */
      meta = null;
    }
  }
  return { ...rest, meta };
}

export function listSessions(db: Database): ChatSessionRow[] {
  return db
    .prepare(
      `SELECT s.id, s.title, s.scope, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.session_id = s.id) AS message_count
         FROM ai_chat_sessions s
        ORDER BY s.updated_at DESC, s.id DESC`
    )
    .all() as ChatSessionRow[];
}

export function getSession(db: Database, id: number): ChatSessionRow | undefined {
  return db
    .prepare(
      `SELECT s.id, s.title, s.scope, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.session_id = s.id) AS message_count
         FROM ai_chat_sessions s
        WHERE s.id = ?`
    )
    .get(id) as ChatSessionRow | undefined;
}

export function listMessages(db: Database, sessionId: number): ChatMessageRow[] {
  const rows = db
    .prepare(
      `SELECT id, session_id, role, content, meta_json, created_at
         FROM ai_chat_messages
        WHERE session_id = ?
        ORDER BY id`
    )
    .all(sessionId) as RawMessage[];
  return rows.map((row) => refreshProposal(db, parseMeta(row)));
}

/**
 * `meta_json` la ANH CHUP luc tra loi, nen trang thai de xuat hanh dong trong do
 * dong bang: duyet mot hanh dong xong, mo lai phien cu van thay "chờ duyệt".
 * Trang thai that nam o bang `ai_action_proposals` — doc lai tu do khi tra ve.
 */
function refreshProposal(db: Database, message: ChatMessageRow): ChatMessageRow {
  const meta = message.meta as { proposal?: { id?: number; status?: string } } | null;
  const id = meta?.proposal?.id;
  if (!id) return message;
  const live = db.prepare(`SELECT status FROM ai_action_proposals WHERE id = ?`).get(id) as
    { status: string } | undefined;
  if (!live) return message;
  return {
    ...message,
    meta: { ...meta, proposal: { ...meta!.proposal, status: live.status } },
  };
}

export function createSession(db: Database, scope: ChatScope = 'all'): ChatSessionRow {
  const info = db.prepare(`INSERT INTO ai_chat_sessions (scope) VALUES (?)`).run(scope);
  pruneSessions(db);
  return getSession(db, Number(info.lastInsertRowid))!;
}

export function renameSession(db: Database, id: number, title: string): void {
  db.prepare(
    `UPDATE ai_chat_sessions SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(title.trim().slice(0, TITLE_MAX), id);
}

export function deleteSession(db: Database, id: number): void {
  // Tin nhan di theo nho ON DELETE CASCADE.
  db.prepare(`DELETE FROM ai_chat_sessions WHERE id = ?`).run(id);
}

/**
 * Ghi mot luot hoi-dap vao phien va day phien len dau danh sach.
 *
 * Lam trong MOT giao dich: neu chi ghi duoc cau hoi ma mat cau tra loi thi lan
 * sau mo lai phien se thay mot cau hoi treo lo lung khong co hoi am.
 */
export function appendTurn(
  db: Database,
  sessionId: number,
  question: string,
  answer: string,
  meta: unknown
): void {
  const insert = db.prepare(
    `INSERT INTO ai_chat_messages (session_id, role, content, meta_json) VALUES (?, ?, ?, ?)`
  );
  db.transaction(() => {
    insert.run(sessionId, 'user', question, null);
    insert.run(sessionId, 'assistant', answer, meta ? JSON.stringify(meta) : null);
    /* Tieu de lay tu cau hoi DAU TIEN, va chi khi phien chua co ten — cau hoi
       thu hai tro di khong duoc doi ten mot phien nguoi dung dang theo doi. */
    db.prepare(
      `UPDATE ai_chat_sessions
          SET updated_at = datetime('now','localtime'),
              title = CASE WHEN title = '' THEN ? ELSE title END
        WHERE id = ?`
    ).run(question.trim().slice(0, TITLE_MAX), sessionId);
  })();
}

/**
 * Giu lai dung `MAX_SESSIONS` phien duoc dung gan nhat.
 *
 * Chay sau moi lan tao phien moi. Xoa theo `updated_at` chu khong phai
 * `created_at`: mot phien cu nhung van duoc quay lai dung thi khong nen bi cat.
 */
export function pruneSessions(db: Database): number {
  const info = db
    .prepare(
      `DELETE FROM ai_chat_sessions
        WHERE id NOT IN (
          SELECT id FROM ai_chat_sessions ORDER BY updated_at DESC, id DESC LIMIT ?
        )`
    )
    .run(MAX_SESSIONS);
  return info.changes;
}
