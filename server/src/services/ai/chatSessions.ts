import type { Database } from 'better-sqlite3';

/**
 * Phien chat voi Tro ly AI — tao, doc, xoa, va gioi han so phien giu lai.
 *
 * Gioi han nam o day chu khong phai trong SQL (khong co trigger LIMIT goi gon),
 * va dat dung MOT cho de sau nay doc lai con biet quy tac o dau.
 */

/**
 * So phien gan nhat duoc giu — TREN MOI NGUOI DUNG, khong phai tren ca he
 * thong. Gioi han chung se lam vai nguoi dung cung luc day lich su cua nhau ra
 * ngoai, va moi nguoi thay con so 20 co nghia khac nhau.
 */
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

/*
 * MOI HAM O DAY DEU NHAN `userId` VA LOC THEO NO.
 *
 * Hoi thoai voi tro ly la du lieu ca nhan, va cau tra loi duoc sinh ra tu pham
 * vi cua nguoi hoi — mot phien cua giam doc chua nhung con so ma nhan vien
 * khong duoc thay. Vi vay khong co ham nao o day doc duoc "moi phien": dieu
 * kien nam ngay trong SQL chu khong phai o cho goi, de mot route viet sau nay
 * khong the quen.
 *
 * `userId` co the la `null` khi tat xac thuc (cac test tich hop dung
 * `createApp({ auth: false })`) — luc do khong loc, vi khong co "nguoi" nao ca.
 */
function ownerClause(userId: number | null, prefix = 's'): { sql: string; params: number[] } {
  if (userId == null) return { sql: '', params: [] };
  return { sql: ` AND ${prefix}.user_id = ?`, params: [userId] };
}

export function listSessions(db: Database, userId: number | null): ChatSessionRow[] {
  const owner = ownerClause(userId);
  return db
    .prepare(
      `SELECT s.id, s.title, s.scope, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.session_id = s.id) AS message_count
         FROM ai_chat_sessions s
        WHERE 1 = 1${owner.sql}
        ORDER BY s.updated_at DESC, s.id DESC`
    )
    .all(...owner.params) as ChatSessionRow[];
}

/**
 * Tra ve `undefined` cho ca phien KHONG TON TAI lan phien CUA NGUOI KHAC — hai
 * truong hop do phai khong phan biet duoc, neu khong thi do id la biet duoc ai
 * dang co bao nhieu hoi thoai (cung ly do `assertInScope` nem 404 chu khong
 * phai 403).
 */
export function getSession(
  db: Database,
  id: number,
  userId: number | null
): ChatSessionRow | undefined {
  const owner = ownerClause(userId);
  return db
    .prepare(
      `SELECT s.id, s.title, s.scope, s.created_at, s.updated_at,
              (SELECT COUNT(*) FROM ai_chat_messages m WHERE m.session_id = s.id) AS message_count
         FROM ai_chat_sessions s
        WHERE s.id = ?${owner.sql}`
    )
    .get(id, ...owner.params) as ChatSessionRow | undefined;
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

export function createSession(
  db: Database,
  userId: number | null,
  scope: ChatScope = 'all'
): ChatSessionRow {
  const info = db
    .prepare(`INSERT INTO ai_chat_sessions (scope, user_id) VALUES (?, ?)`)
    .run(scope, userId);
  pruneSessions(db, userId);
  return getSession(db, Number(info.lastInsertRowid), userId)!;
}

export function renameSession(
  db: Database,
  id: number,
  title: string,
  userId: number | null
): void {
  const owner = ownerClause(userId, 'ai_chat_sessions');
  db.prepare(
    `UPDATE ai_chat_sessions SET title = ?, updated_at = datetime('now','localtime')
      WHERE id = ?${owner.sql}`
  ).run(title.trim().slice(0, TITLE_MAX), id, ...owner.params);
}

export function deleteSession(db: Database, id: number, userId: number | null): void {
  // Tin nhan di theo nho ON DELETE CASCADE.
  const owner = ownerClause(userId, 'ai_chat_sessions');
  db.prepare(`DELETE FROM ai_chat_sessions WHERE id = ?${owner.sql}`).run(id, ...owner.params);
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
export function pruneSessions(db: Database, userId: number | null): number {
  const owner = ownerClause(userId, 'ai_chat_sessions');
  const info = db
    .prepare(
      `DELETE FROM ai_chat_sessions
        WHERE 1 = 1${owner.sql}
          AND id NOT IN (
            SELECT id FROM ai_chat_sessions
             WHERE 1 = 1${owner.sql}
             ORDER BY updated_at DESC, id DESC LIMIT ?
          )`
    )
    .run(...owner.params, ...owner.params, MAX_SESSIONS);
  return info.changes;
}
