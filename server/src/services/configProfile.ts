/**
 * Ho so cau hinh (1.27.0) — mang cau hinh nghiep vu giua cac ban cai.
 *
 * Moi khach hang la mot ban cai rieng. Ho so la mot tep JSON gom moi thu quan tri
 * vien tu chinh: danh muc, pipeline, cham diem, ban giao, trien khai, vi tri va
 * quyen. Dung de dung khach moi tu mot mau co san, hoac sao chep cau hinh da tinh
 * chinh o mot khach sang khach khac.
 *
 * Nhap theo KHOA va KHONG BAO GIO XOA: muc co trong ho so thi tao/cap nhat, muc
 * chi co o ban cai thi giu nguyen. Ho so khong mang du lieu nghiep vu nao (khach
 * hang, co hoi...) — xem routes/system.ts cho ban xuat du lieu.
 */
import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import {
  CARD_STATUSES,
  FLOW_ASK_MODES,
  FLOW_STATUSES,
  PERMISSION_RESOURCES,
  PERMISSION_SCOPES,
  PICKLIST_KEYS,
  PERMISSION_ACTIONS,
  type FlowStatus,
} from '@workflow/contracts';
import { getTaskFlowSettings, saveTaskFlowSettings } from '../lib/taskFlowSettings.ts';
import { HttpError } from '../lib/validate.ts';
import {
  createPicklistItem,
  getAllPicklists,
  getPicklist,
  invalidatePicklists,
  updatePicklistItem,
  usageCount,
} from '../lib/picklists.ts';
import {
  createStage,
  defaultPipeline,
  invalidatePipeline,
  reorderStages,
  updateStage,
} from '../lib/pipeline.ts';
import { getScoringSettings, saveScoringSettings } from '../lib/scoring.ts';
import { getHandoverSettings, saveHandoverSettings } from './handoverService.ts';
import { getDeliverySettings, saveDeliverySettings } from './deliveryService.ts';

export const PROFILE_SCHEMA_VERSION = 1;

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable()
  .optional();

const profileSchema = z.object({
  schema_version: z.literal(PROFILE_SCHEMA_VERSION),
  name: z.string().max(200).optional(),
  /* partialRecord: ho so co the chi mang vai danh muc (z.record voi enum doi du moi khoa). */
  picklists: z
    .partialRecord(
      z.enum(PICKLIST_KEYS),
      z.array(
        z.object({
          key: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1).max(100),
          color: hex,
          is_active: z.boolean().optional(),
        })
      )
    )
    .optional(),
  pipeline: z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      stages: z
        .array(
          z.object({
            key: z
              .string()
              .trim()
              .regex(/^[a-z0-9_]{1,60}$/, 'Khoá giai đoạn chỉ gồm a-z, 0-9, _'),
            label: z.string().trim().min(1).max(60),
            category: z.enum(['open', 'won', 'lost']),
            color: hex,
            probability: z.number().int().min(0).max(100).optional(),
            is_active: z.boolean().optional(),
            gate_bant_min: z.number().int().min(0).max(12).nullable().optional(),
            require_economic_buyer: z.boolean().optional(),
            track_poc: z.boolean().optional(),
            max_days_in_stage: z.number().int().min(1).max(3650).nullable().optional(),
          })
        )
        .min(3),
    })
    .optional(),
  scoring: z
    .object({
      stale_days: z.number().int().min(1).max(365).optional(),
      v3_mode: z.enum(['warn', 'veto']).optional(),
      challenge_threshold_vnd: z.number().int().min(0).optional(),
      winloss_min_deals: z.number().int().min(1).max(1000).optional(),
    })
    .optional(),
  handover: z
    .object({
      sla_days: z.number().int().min(1).max(365).optional(),
      templates: z
        .record(
          z.string().trim().min(1).max(50),
          z.array(z.object({ content: z.string().trim().min(1).max(500), required: z.boolean() }))
        )
        .optional(),
    })
    .optional(),
  delivery: z
    .object({
      classification: z.record(z.string(), z.number()).optional(),
      board_templates: z
        .record(
          z.string(),
          z.array(z.object({ name: z.string().trim().min(1), status: z.string().nullable() }))
        )
        .optional(),
    })
    .optional(),
  /* v66 — Quy trinh theo trang thai: cong tac va mau tung trang thai. */
  task_flow: z
    .object({
      enabled: z.boolean().optional(),
      templates: z
        .partialRecord(
          z.enum(FLOW_STATUSES as [FlowStatus, ...FlowStatus[]]),
          z.object({
            steps: z.array(z.string().trim().min(1).max(500)).max(50),
            next_status: z.enum(CARD_STATUSES),
            ask: z.enum(FLOW_ASK_MODES),
          })
        )
        .optional(),
    })
    .optional(),
  positions: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        code: z.string().trim().max(50).nullable().optional(),
        description: z.string().max(1000).optional(),
        permissions: z.array(
          z.object({
            resource: z.string(),
            action: z.string(),
            scope: z.enum(PERMISSION_SCOPES),
          })
        ),
      })
    )
    .optional(),
});

export type ConfigProfile = z.infer<typeof profileSchema>;

export interface ImportReport {
  created: string[];
  updated: string[];
  warnings: string[];
}

/* ---------- Xuat ---------- */

export function exportProfile(db: Database, name?: string): ConfigProfile {
  const picklists = getAllPicklists(db);
  const pipeline = defaultPipeline(db);
  const scoring = getScoringSettings(db);
  const handover = getHandoverSettings(db);
  const delivery = getDeliverySettings(db);
  const taskFlow = getTaskFlowSettings(db);
  const positions = db
    .prepare(`SELECT id, name, code, description FROM positions ORDER BY position, id`)
    .all() as { id: number; name: string; code: string | null; description: string }[];
  const permissions = db
    .prepare(`SELECT position_id, resource, action, scope FROM position_permissions`)
    .all() as { position_id: number; resource: string; action: string; scope: string }[];

  return {
    schema_version: PROFILE_SCHEMA_VERSION,
    name,
    picklists: Object.fromEntries(
      PICKLIST_KEYS.map((list) => [
        list,
        picklists[list].map((item) => ({
          key: item.item_key,
          label: item.label,
          color: item.color,
          is_active: item.is_active === 1,
        })),
      ])
    ) as ConfigProfile['picklists'],
    pipeline: {
      name: pipeline.name,
      stages: pipeline.stages.map((stage) => ({
        key: stage.key,
        label: stage.label,
        category: stage.category,
        color: stage.color,
        probability: stage.probability,
        is_active: stage.is_active === 1,
        gate_bant_min: stage.gate_bant_min,
        require_economic_buyer: stage.require_economic_buyer === 1,
        track_poc: stage.track_poc === 1,
        max_days_in_stage: stage.max_days_in_stage,
      })),
    },
    scoring: {
      stale_days: scoring.staleDays,
      v3_mode: scoring.v3Mode,
      challenge_threshold_vnd: scoring.challengeThresholdVnd,
      winloss_min_deals: scoring.winlossMinDeals,
    },
    handover: { sla_days: handover.slaDays, templates: handover.templates },
    delivery: {
      classification: { ...delivery.classification },
      board_templates: delivery.boardTemplates,
    },
    task_flow: { enabled: taskFlow.enabled, templates: taskFlow.templates },
    positions: positions.map((position) => ({
      name: position.name,
      code: position.code,
      description: position.description,
      permissions: permissions
        .filter((row) => row.position_id === position.id)
        .map((row) => ({
          resource: row.resource,
          action: row.action,
          scope: row.scope as (typeof PERMISSION_SCOPES)[number],
        })),
    })),
  };
}

/* ---------- Nhap ---------- */

export function parseProfile(raw: unknown): ConfigProfile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError(
      422,
      `Hồ sơ cấu hình không hợp lệ: ${first.path.join('.')} — ${first.message}`,
      {
        code: 'PROFILE_INVALID',
      }
    );
  }
  return result.data;
}

class DryRun extends Error {}

/**
 * Ap ho so vao CSDL trong MOT giao dich. `dryRun` chay het moi buoc roi huy giao
 * dich — bao cao la chinh xac nhung gi se xay ra, khong phai uoc doan.
 */
export function applyProfile(db: Database, profile: ConfigProfile, dryRun = false): ImportReport {
  const report: ImportReport = { created: [], updated: [], warnings: [] };
  try {
    db.transaction(() => {
      applyPicklists(db, profile, report);
      applyPipeline(db, profile, report);
      applySettings(db, profile, report);
      applyPositions(db, profile, report);
      if (dryRun) throw new DryRun();
    })();
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  } finally {
    /* Ban dem trong bo nho co the da nap trang thai giua chung cua giao dich da huy. */
    invalidatePicklists(db);
    invalidatePipeline(db);
  }
  return report;
}

function applyPicklists(db: Database, profile: ConfigProfile, report: ImportReport): void {
  for (const [list, items] of Object.entries(profile.picklists ?? {})) {
    const key = list as (typeof PICKLIST_KEYS)[number];
    /* Id cac muc da khop voi ho so — moi muc khac la "chi co o ban cai". */
    const matched = new Set<number>();
    for (const [index, entry] of (items ?? []).entries()) {
      /* Khop theo khoa truoc, khong co thi theo ten (khong phan biet hoa thuong): hai
         ban cai tu sinh khoa tu ten nen cung mot muc co the mang khoa khac nhau. */
      const current = getPicklist(db, key);
      const existing =
        current.find((item) => item.item_key === entry.key) ??
        current.find(
          (item) => item.label.toLocaleLowerCase('vi') === entry.label.toLocaleLowerCase('vi')
        );
      if (existing) {
        matched.add(existing.id);
        const changed =
          existing.label !== entry.label ||
          (entry.color !== undefined && existing.color !== entry.color) ||
          (entry.is_active !== undefined && (existing.is_active === 1) !== entry.is_active);
        if (changed) {
          if (entry.is_active === false && existing.is_system === 1) {
            report.warnings.push(
              `Danh mục ${list}: mục hệ thống "${existing.label}" không ẩn được`
            );
          }
          updatePicklistItem(db, key, existing.id, {
            label: entry.label,
            color: entry.color,
            is_active: existing.is_system === 1 ? undefined : entry.is_active,
          });
          report.updated.push(`Danh mục ${list}: ${entry.label}`);
        }
        db.prepare(`UPDATE picklist_items SET position = ? WHERE id = ?`).run(
          index + 1,
          existing.id
        );
        continue;
      }
      const created = createPicklistItem(db, key, { label: entry.label, color: entry.color });
      /* Giu dung khoa cua ho so (neu chua ai dung) de nhap lan sau van khop. */
      const keyFree = !getPicklist(db, key).some((item) => item.item_key === entry.key);
      db.prepare(
        `UPDATE picklist_items SET item_key = ?, position = ?, is_active = ? WHERE id = ?`
      ).run(
        keyFree ? entry.key : created.item_key,
        index + 1,
        entry.is_active === false ? 0 : 1,
        created.id
      );
      matched.add(created.id);
      report.created.push(`Danh mục ${list}: ${entry.label}`);
    }
    /* Muc chi co o ban cai: chua ai dung thi an (dung lai duoc), dang dung thi giu
       va bao — de ban cai moi khop dung ho so ma khong mat du lieu nao. */
    invalidatePicklists(db);
    for (const item of getPicklist(db, key)) {
      if (matched.has(item.id) || item.is_active === 0 || item.is_system === 1) continue;
      const used = usageCount(db, key, item);
      if (used > 0) {
        report.warnings.push(
          `Danh mục ${list}: giữ "${item.label}" (không có trong hồ sơ, đang có ${used} bản ghi dùng)`
        );
      } else {
        updatePicklistItem(db, key, item.id, { is_active: false });
        report.updated.push(`Danh mục ${list}: ẩn "${item.label}" (không có trong hồ sơ)`);
      }
    }
  }
}

function applyPipeline(db: Database, profile: ConfigProfile, report: ImportReport): void {
  const incoming = profile.pipeline;
  if (!incoming) return;
  const won = incoming.stages.filter((stage) => stage.category === 'won');
  const lost = incoming.stages.filter((stage) => stage.category === 'lost');
  if (won.length !== 1 || lost.length !== 1) {
    throw new HttpError(422, 'Pipeline trong hồ sơ phải có đúng một giai đoạn Thắng và một Thua', {
      code: 'PROFILE_INVALID',
    });
  }
  let pipeline = defaultPipeline(db);
  if (incoming.name && incoming.name !== pipeline.name) {
    db.prepare(`UPDATE pipelines SET name = ? WHERE id = ?`).run(incoming.name, pipeline.id);
    invalidatePipeline(db);
  }

  for (const entry of incoming.stages) {
    pipeline = defaultPipeline(db);
    /* Thang/Thua khop theo LOAI, khong theo khoa: moi pipeline co dung mot cai, va
       khoa cua no da nam trong du lieu co hoi. */
    const existing =
      entry.category === 'open'
        ? pipeline.stages.find((stage) => stage.key === entry.key)
        : pipeline.stages.find((stage) => stage.category === entry.category);
    const patch = {
      label: entry.label,
      color: entry.color,
      probability: entry.category === 'open' ? entry.probability : undefined,
      gate_bant_min: entry.category === 'lost' ? undefined : entry.gate_bant_min,
      require_economic_buyer: entry.require_economic_buyer,
      track_poc: entry.track_poc,
      max_days_in_stage: entry.max_days_in_stage,
    };
    if (existing) {
      if (existing.category !== entry.category) {
        throw new HttpError(
          422,
          `Giai đoạn "${entry.key}" là loại ${existing.category} ở bản cài này, hồ sơ ghi ${entry.category}`,
          { code: 'PROFILE_STAGE_CATEGORY' }
        );
      }
      updateStage(db, pipeline.id, existing.id, patch);
      report.updated.push(`Giai đoạn: ${entry.label}`);
      if (entry.is_active !== undefined && (existing.is_active === 1) !== entry.is_active) {
        if (entry.is_active) {
          db.prepare(`UPDATE pipeline_stages SET is_active = 1 WHERE id = ?`).run(existing.id);
        } else {
          const count = (
            db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage = ?`).get(existing.key) as {
              n: number;
            }
          ).n;
          if (count > 0) {
            report.warnings.push(
              `Giai đoạn "${existing.label}" còn ${count} cơ hội — không ẩn; hãy ẩn ở Cài đặt và chọn nơi chuyển`
            );
          } else {
            db.prepare(`UPDATE pipeline_stages SET is_active = 0 WHERE id = ?`).run(existing.id);
          }
        }
        invalidatePipeline(db);
      }
      continue;
    }
    if (entry.category !== 'open') continue; // da khop theo loai o tren
    const created = createStage(db, pipeline.id, { ...patch, label: entry.label });
    db.prepare(`UPDATE pipeline_stages SET key = ?, is_active = ? WHERE id = ?`).run(
      entry.key,
      entry.is_active === false ? 0 : 1,
      created.id
    );
    invalidatePipeline(db);
    report.created.push(`Giai đoạn: ${entry.label}`);
  }

  /* Thu tu: giai doan mo theo ho so truoc, giai doan chi co o ban cai giu sau cung. */
  pipeline = defaultPipeline(db);
  const openKeys = incoming.stages
    .filter((stage) => stage.category === 'open')
    .map((stage) => stage.key);
  const open = pipeline.stages.filter((stage) => stage.category === 'open');
  const ordered = [
    ...openKeys
      .map((key) => open.find((stage) => stage.key === key)?.id)
      .filter((id): id is number => id !== undefined),
    ...open.filter((stage) => !openKeys.includes(stage.key)).map((stage) => stage.id),
  ];
  reorderStages(db, pipeline.id, ordered);
  const leftovers = open.filter((stage) => !openKeys.includes(stage.key) && stage.is_active === 1);
  const kept: string[] = [];
  for (const stage of leftovers) {
    const count = (
      db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage = ?`).get(stage.key) as { n: number }
    ).n;
    if (count > 0) {
      kept.push(`${stage.label} (${count} cơ hội)`);
    } else {
      db.prepare(`UPDATE pipeline_stages SET is_active = 0 WHERE id = ?`).run(stage.id);
      report.updated.push(`Giai đoạn: ẩn "${stage.label}" (không có trong hồ sơ)`);
    }
  }
  invalidatePipeline(db);
  if (defaultPipeline(db).stages.every((stage) => stage.category !== 'open' || !stage.is_active)) {
    throw new HttpError(422, 'Hồ sơ phải có ít nhất một giai đoạn mở đang dùng', {
      code: 'PROFILE_INVALID',
    });
  }
  if (kept.length > 0) {
    report.warnings.push(
      `Giữ ${kept.length} giai đoạn không có trong hồ sơ vì còn cơ hội: ${kept.join(', ')}`
    );
  }
}

function applySettings(db: Database, profile: ConfigProfile, report: ImportReport): void {
  if (profile.scoring && Object.keys(profile.scoring).length > 0) {
    saveScoringSettings(db, profile.scoring);
    report.updated.push('Chấm điểm cơ hội');
  }
  if (profile.handover && Object.keys(profile.handover).length > 0) {
    if (profile.handover.templates && !profile.handover.templates.default?.length) {
      throw new HttpError(422, 'Hồ sơ: bộ mẫu bàn giao "default" là bắt buộc', {
        code: 'PROFILE_INVALID',
      });
    }
    saveHandoverSettings(db, profile.handover as Record<string, unknown>);
    report.updated.push('Bàn giao');
  }
  if (profile.delivery && Object.keys(profile.delivery).length > 0) {
    saveDeliverySettings(db, profile.delivery as Record<string, unknown>);
    report.updated.push('Triển khai');
  }
  if (profile.task_flow && Object.keys(profile.task_flow).length > 0) {
    for (const [status, template] of Object.entries(profile.task_flow.templates ?? {})) {
      if (template?.next_status === status) {
        throw new HttpError(422, `Hồ sơ: quy trình "${status}" không được tự chuyển về chính nó`, {
          code: 'PROFILE_INVALID',
        });
      }
    }
    saveTaskFlowSettings(db, profile.task_flow);
    report.updated.push('Quy trình công việc');
  }
}

function applyPositions(db: Database, profile: ConfigProfile, report: ImportReport): void {
  if (!profile.positions) return;
  let touched = false;
  for (const entry of profile.positions) {
    for (const permission of entry.permissions) {
      /* Chi doi tai nguyen va hanh dong thuoc danh muc quyen. Khong doi khop
         RESOURCE_ACTIONS: du lieu goc (v39) co to hop nam ngoai bang do, va mot ho
         so xuat tu chinh ban cai phai nhap lai duoc. */
      if (
        !(PERMISSION_RESOURCES as readonly string[]).includes(permission.resource) ||
        !(PERMISSION_ACTIONS as readonly string[]).includes(permission.action)
      ) {
        throw new HttpError(
          422,
          `Hồ sơ: quyền không hợp lệ ${permission.resource}:${permission.action} ở vị trí "${entry.name}"`,
          { code: 'PROFILE_INVALID' }
        );
      }
    }
    const existing = db
      .prepare(`SELECT id, is_system FROM positions WHERE name = ?`)
      .get(entry.name) as { id: number; is_system: number } | undefined;
    if (existing?.is_system === 1) {
      report.warnings.push(`Vị trí hệ thống "${entry.name}" giữ nguyên quyền`);
      continue;
    }
    let id = existing?.id;
    if (id === undefined) {
      const last = (
        db.prepare(`SELECT COALESCE(MAX(position), 0) AS p FROM positions`).get() as { p: number }
      ).p;
      id = Number(
        db
          .prepare(`INSERT INTO positions (name, code, description, position) VALUES (?, ?, ?, ?)`)
          .run(entry.name, entry.code ?? null, entry.description ?? '', last + 1).lastInsertRowid
      );
      report.created.push(`Vị trí: ${entry.name}`);
    } else {
      db.prepare(`UPDATE positions SET description = ? WHERE id = ?`).run(
        entry.description ?? '',
        id
      );
      report.updated.push(`Vị trí: ${entry.name}`);
    }
    /* Ma tran quyen cua mot vi tri la mot khoi: thay ca khoi, khong tron. */
    db.prepare(`DELETE FROM position_permissions WHERE position_id = ?`).run(id);
    const insert = db.prepare(
      `INSERT INTO position_permissions (position_id, resource, action, scope) VALUES (?, ?, ?, ?)`
    );
    for (const permission of entry.permissions)
      insert.run(id, permission.resource, permission.action, permission.scope);
    touched = true;
  }
  if (touched) {
    db.prepare(
      `UPDATE app_settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT),
              updated_at = datetime('now','localtime')
        WHERE key = 'permissions.version'`
    ).run();
  }
}
