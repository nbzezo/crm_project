import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { accessOf } from '../middleware/currentUser.ts';
import { HttpError, intParam, parseBody } from '../lib/validate.ts';

/*
 * Link nhac yeu thich (v59, 1.20.0): YouTube / Spotify / radio nguoi dung luu lai
 * de nghe o man cho va man lam viec, theo tai khoan nen doi may van con.
 *
 * May chu chi giu link goc va ten. Nhan dien loai link va dung dia chi nhung la
 * viec cua giao dien (lib/musicLinks.ts) — link nao giao dien khong nhan ra thi
 * khong phat, nen o day chi can chan du lieu rac (khong phai http/https, qua dai).
 */

const router = Router();

/** Du cho mot bo suu tap; chan mot tai khoan don hang nghin dong vao CSDL. */
export const MAX_MUSIC_LINKS = 50;

function userIdOf(req: Request): number {
  const id = accessOf(req).userId;
  if (!id) throw new HttpError(400, 'Cần đăng nhập để lưu link nhạc');
  return id;
}

interface MusicLinkRow {
  id: number;
  title: string;
  url: string;
  created_at: string;
}

const COLUMNS = 'id, title, url, created_at';

function listOf(userId: number): MusicLinkRow[] {
  return db
    .prepare(
      `SELECT ${COLUMNS} FROM user_music_links WHERE user_id = ? ORDER BY created_at DESC, id DESC`
    )
    .all(userId) as MusicLinkRow[];
}

const urlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'Link phải bắt đầu bằng http(s)://');

const createSchema = z.object({
  url: urlSchema,
  title: z.string().trim().min(1).max(60),
});

router.get('/', (req, res) => {
  res.json(listOf(userIdOf(req)));
});

/** Luu link; link da co thi chi doi ten (khong tao dong trung). */
router.post('/', (req, res) => {
  const userId = userIdOf(req);
  const body = parseBody(createSchema, req);
  const existing = db
    .prepare('SELECT id FROM user_music_links WHERE user_id = ? AND url = ?')
    .get(userId, body.url) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE user_music_links SET title = ? WHERE id = ?').run(body.title, existing.id);
  } else {
    const count = (
      db.prepare('SELECT COUNT(*) AS n FROM user_music_links WHERE user_id = ?').get(userId) as {
        n: number;
      }
    ).n;
    if (count >= MAX_MUSIC_LINKS) {
      throw new HttpError(400, `Chỉ lưu được tối đa ${MAX_MUSIC_LINKS} link, hãy xóa bớt link cũ`);
    }
    db.prepare('INSERT INTO user_music_links (user_id, title, url) VALUES (?, ?, ?)').run(
      userId,
      body.title,
      body.url
    );
  }
  const row = db
    .prepare(`SELECT ${COLUMNS} FROM user_music_links WHERE user_id = ? AND url = ?`)
    .get(userId, body.url) as MusicLinkRow;
  res.status(existing ? 200 : 201).json(row);
});

router.delete('/:id', (req, res) => {
  const userId = userIdOf(req);
  const id = intParam(req.params.id);
  /* Chi xoa link cua chinh minh; id cua nguoi khac coi nhu khong ton tai. */
  const result = db
    .prepare('DELETE FROM user_music_links WHERE id = ? AND user_id = ?')
    .run(id, userId);
  if (result.changes === 0) throw new HttpError(404, 'Không tìm thấy link');
  res.status(204).end();
});

export default router;
