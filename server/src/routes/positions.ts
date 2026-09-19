import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_ACTIONS, PERMISSION_RESOURCES, PERMISSION_SCOPES } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError, intParam, parseBody, required } from '../lib/validate.ts';
import { requirePermission } from '../middleware/currentUser.ts';
import { bumpPermissionsVersion } from '../services/auth/access.ts';
import {
  assertAdminRemains,
  assertNotSystemPosition,
  assertPositionUnused,
  getPositionPermissions,
  setPositionPermissions,
} from '../services/auth/orgService.ts';

const router = Router();

/* Mot guard duy nhat cho ca router thay vi gan len tung route: mot route
   them sau nay khong the lot luoi. GET can `read`, moi thao tac ghi can
   `update` — them/sua/xoa deu la mot thay doi cau hinh phan quyen. */
router.use((req, res, next) => {
  const action = req.method === 'GET' ? 'read' : 'update';
  requirePermission('admin.positions', action)(req, res, next);
});

/*
 * Vi tri va ma tran phan quyen — cau hinh dong, khong phai code.
 *
 * Them mot loai vi tri, doi pham vi cua mot o, nhan ban mot vi tri roi sua: tat
 * ca la thao tac du lieu, co hieu luc o request ke tiep cua nguoi bi anh huong.
 * Khong deploy, khong migration. Xem dau tep migrate-v39.sql.
 */

const POSITION_SELECT = `
  SELECT p.*, (SELECT COUNT(*) FROM user_positions up WHERE up.position_id = p.id) AS holder_count
    FROM positions p`;

router.get('/', (_req, res) => {
  res.json(db.prepare(`${POSITION_SELECT} ORDER BY p.position, p.id`).all());
});

/** Danh muc de client ve ma tran — lay tu chinh nguon ma may chu kiem tra. */
router.get('/catalog', (_req, res) => {
  res.json({
    resources: PERMISSION_RESOURCES,
    actions: PERMISSION_ACTIONS,
    scopes: PERMISSION_SCOPES,
  });
});

router.get('/:id/permissions', (req, res) => {
  const id = intParam(req.params.id);
  required(db.prepare('SELECT id FROM positions WHERE id = ?').get(id), 'Khong tim thay vi tri');
  res.json(getPositionPermissions(id));
});

const positionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(500).optional(),
  /** Nhan ban ma tran quyen cua mot vi tri co san — cach nhanh nhat de de mot cap moi. */
  copy_from_position_id: z.number().int().positive().optional(),
});

router.post('/', (req, res) => {
  const body = parseBody(positionSchema, req);
  const maxPos = db.prepare('SELECT MAX(position) AS maxPos FROM positions').get() as {
    maxPos: number | null;
  };

  const id = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO positions (name, code, description, position) VALUES (?, ?, ?, ?)')
      .run(body.name, body.code || null, body.description ?? '', (maxPos.maxPos ?? 0) + 1024);
    const newId = Number(info.lastInsertRowid);

    if (body.copy_from_position_id) {
      required(
        db.prepare('SELECT id FROM positions WHERE id = ?').get(body.copy_from_position_id),
        'Khong tim thay vi tri nguon'
      );
      db.prepare(
        `INSERT INTO position_permissions (position_id, resource, action, scope)
         SELECT ?, resource, action, scope FROM position_permissions WHERE position_id = ?`
      ).run(newId, body.copy_from_position_id);
    }
    bumpPermissionsVersion();
    return newId;
  })();

  res.status(201).json(db.prepare(`${POSITION_SELECT} WHERE p.id = ?`).get(id));
});

router.patch('/:id', (req, res) => {
  const id = intParam(req.params.id);
  const body = parseBody(positionSchema.omit({ copy_from_position_id: true }).partial(), req);
  const current = required(
    db.prepare('SELECT * FROM positions WHERE id = ?').get(id),
    'Khong tim thay vi tri'
  ) as { name: string; code: string | null; description: string };

  db.prepare('UPDATE positions SET name = ?, code = ?, description = ? WHERE id = ?').run(
    body.name ?? current.name,
    body.code === undefined ? current.code : body.code || null,
    body.description ?? current.description,
    id
  );
  res.json(db.prepare(`${POSITION_SELECT} WHERE p.id = ?`).get(id));
});

const permissionsSchema = z.object({
  permissions: z
    .array(
      z.object({
        resource: z.string().min(1).max(60),
        action: z.string().min(1).max(20),
        scope: z.string().min(1).max(20),
      })
    )
    .max(1000),
});

router.put('/:id/permissions', (req, res) => {
  const id = intParam(req.params.id);
  required(db.prepare('SELECT id FROM positions WHERE id = ?').get(id), 'Khong tim thay vi tri');
  const body = parseBody(permissionsSchema, req);
  setPositionPermissions(id, body.permissions);
  res.json(getPositionPermissions(id));
});

router.delete('/:id', (req, res) => {
  const id = intParam(req.params.id);
  required(db.prepare('SELECT id FROM positions WHERE id = ?').get(id), 'Khong tim thay vi tri');
  assertNotSystemPosition(id);
  assertPositionUnused(id);
  db.transaction(() => {
    db.prepare('DELETE FROM positions WHERE id = ?').run(id);
    assertAdminRemains();
    bumpPermissionsVersion();
  })();
  res.status(204).end();
});

/* ---------- Gan vi tri cho nguoi dung ---------- */

router.get('/assignments/:userId', (req, res) => {
  const userId = intParam(req.params.userId);
  res.json(
    db
      .prepare(
        `SELECT up.position_id, up.scope_unit_id, up.is_primary, p.name AS position_name,
                o.name AS scope_unit_name
           FROM user_positions up
           JOIN positions p ON p.id = up.position_id
           LEFT JOIN org_units o ON o.id = up.scope_unit_id
          WHERE up.user_id = ?
          ORDER BY up.is_primary DESC, p.position`
      )
      .all(userId)
  );
});

const assignmentSchema = z.object({
  positions: z
    .array(
      z.object({
        position_id: z.number().int().positive(),
        /* NULL = dung don vi cua chinh nguoi do. Chi dien khi kiem nhiem. */
        scope_unit_id: z.number().int().positive().nullable().optional(),
        is_primary: z.boolean().optional(),
      })
    )
    .max(20),
});

/**
 * Ghi de toan bo vi tri cua mot nguoi.
 *
 * Ghi de ca tap thay vi them/bot tung dong, cung ly do voi ma tran quyen: client
 * gui ve trang thai no muon thay. `assertAdminRemains` chay SAU khi ghi, trong
 * cung transaction — cau hoi dung la "ket qua ra sao", khong phai "thao tac trong
 * the nao".
 */
router.put('/assignments/:userId', (req, res) => {
  const userId = intParam(req.params.userId);
  required(db.prepare('SELECT id FROM users WHERE id = ?').get(userId), 'Khong tim thay tai khoan');
  const body = parseBody(assignmentSchema, req);

  const seen = new Set<number>();
  for (const row of body.positions) {
    if (seen.has(row.position_id)) {
      throw new HttpError(400, 'Một vị trí chỉ gán được một lần cho cùng một người');
    }
    seen.add(row.position_id);
  }

  db.transaction(() => {
    db.prepare('DELETE FROM user_positions WHERE user_id = ?').run(userId);
    const insert = db.prepare(
      'INSERT INTO user_positions (user_id, position_id, scope_unit_id, is_primary) VALUES (?, ?, ?, ?)'
    );
    for (const row of body.positions) {
      insert.run(userId, row.position_id, row.scope_unit_id ?? null, row.is_primary ? 1 : 0);
    }
    assertAdminRemains();
    bumpPermissionsVersion();
  })();

  res.json(
    db
      .prepare(
        `SELECT up.position_id, up.scope_unit_id, up.is_primary, p.name AS position_name
           FROM user_positions up JOIN positions p ON p.id = up.position_id
          WHERE up.user_id = ?`
      )
      .all(userId)
  );
});

export default router;
