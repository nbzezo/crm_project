/**
 * Giai doan co hoi doc tu `pipeline_stages` (v64).
 *
 * Ma nguon KHONG goi ten giai doan ('negotiating', 'poc'...), chi hoi thuoc tinh:
 * loai (mo/thang/thua), cong diem, phu quyet, theo doi PoC. Them, doi ten, sap xep
 * giai doan vi vay khong cham toi ma.
 *
 * Doc qua ban dem trong bo nho theo ket noi CSDL — bang chi vai chuc dong nhung bi
 * hoi o gan nhu moi request co hoi. Moi ham ghi cau hinh goi `invalidatePipeline`.
 */
import type { Database } from 'better-sqlite3';
import { HttpError } from './validate.ts';

export type StageCategory = 'open' | 'won' | 'lost';

export interface PipelineStage {
  id: number;
  pipeline_id: number;
  key: string;
  label: string;
  category: StageCategory;
  position: number;
  color: string | null;
  probability: number;
  is_active: 0 | 1;
  gate_bant_min: number | null;
  require_economic_buyer: 0 | 1;
  track_poc: 0 | 1;
  max_days_in_stage: number | null;
}

export interface Pipeline {
  id: number;
  name: string;
  is_default: 0 | 1;
  stages: PipelineStage[];
}

const cache = new WeakMap<Database, Pipeline[]>();

export function invalidatePipeline(db: Database): void {
  cache.delete(db);
}

function load(db: Database): Pipeline[] {
  const cached = cache.get(db);
  if (cached) return cached;
  const pipelines = db
    .prepare(`SELECT id, name, is_default FROM pipelines ORDER BY position, id`)
    .all() as Omit<Pipeline, 'stages'>[];
  const stages = db
    .prepare(
      `SELECT id, pipeline_id, key, label, category, position, color, probability, is_active,
              gate_bant_min, require_economic_buyer, track_poc, max_days_in_stage
         FROM pipeline_stages ORDER BY pipeline_id, position, id`
    )
    .all() as PipelineStage[];
  const result = pipelines.map((pipeline) => ({
    ...pipeline,
    stages: stages.filter((stage) => stage.pipeline_id === pipeline.id),
  }));
  cache.set(db, result);
  return result;
}

export function getPipelines(db: Database): Pipeline[] {
  return load(db);
}

/** Pipeline mac dinh — giao dien hien chi co mot. */
export function defaultPipeline(db: Database): Pipeline {
  const pipelines = load(db);
  const pipeline = pipelines.find((entry) => entry.is_default === 1) ?? pipelines[0];
  if (!pipeline) throw new Error('Chua co pipeline nao');
  return pipeline;
}

/** Moi giai doan theo thu tu hien thi, ke ca giai doan dang an. */
export function allStages(db: Database): PipelineStage[] {
  return load(db).flatMap((pipeline) => pipeline.stages);
}

export function findStage(db: Database, key: string): PipelineStage | undefined {
  return allStages(db).find((stage) => stage.key === key);
}

export function stageOf(db: Database, key: string): PipelineStage {
  const stage = findStage(db, key);
  if (!stage)
    throw new HttpError(422, `Giai đoạn "${key}" không tồn tại`, { code: 'STAGE_UNKNOWN' });
  return stage;
}

/**
 * Kiem tra giai doan dich cua mot lan tao/chuyen co hoi. Giai doan dang an chi hop
 * le khi co hoi da nam san o do (`current`) — sua co hoi cu khong bi chan.
 */
export function assertStage(db: Database, key: string, current?: string | null): PipelineStage {
  const stage = stageOf(db, key);
  if (stage.is_active === 0 && key !== current) {
    throw new HttpError(422, `Giai đoạn "${stage.label}" đã ngừng dùng`, {
      code: 'STAGE_INACTIVE',
    });
  }
  return stage;
}

export function isClosedStage(db: Database, key: string): boolean {
  return stageOf(db, key).category !== 'open';
}

/** Giai doan mo dau tien cua pipeline (thay cho 'lead' viet cung). */
export function startStage(db: Database, pipelineId?: number): PipelineStage {
  const pipeline =
    pipelineId === undefined
      ? defaultPipeline(db)
      : (load(db).find((entry) => entry.id === pipelineId) ?? defaultPipeline(db));
  const stage = pipeline.stages.find((entry) => entry.category === 'open' && entry.is_active === 1);
  if (!stage) throw new Error('Pipeline khong co giai doan mo nao');
  return stage;
}

/** Giai doan mo CUOI CUNG (gan chot nhat) cua pipeline chua `key`. */
export function lastOpenStage(db: Database, pipelineId: number): PipelineStage | undefined {
  const pipeline = load(db).find((entry) => entry.id === pipelineId);
  return pipeline?.stages.filter((stage) => stage.category === 'open').at(-1);
}

/** Khoa giai doan mo cuoi cung cua moi pipeline — "da toi giai doan cuoi". */
export function finalOpenStageKeys(db: Database): string[] {
  return load(db)
    .map((pipeline) => lastOpenStage(db, pipeline.id)?.key)
    .filter((key): key is string => key !== undefined);
}

/** Giai doan dau tien cua mot loai ('won' / 'lost') trong pipeline mac dinh. */
export function stageOfCategory(db: Database, category: Exclude<StageCategory, 'open'>) {
  const stage = defaultPipeline(db).stages.find((entry) => entry.category === category);
  if (!stage) throw new Error(`Pipeline khong co giai doan ${category}`);
  return stage;
}

/* ---------- Ghi cau hinh (1.26.0) ----------

   Bat bien, kiem o day chu khong o giao dien:
   - moi pipeline co DUNG MOT giai doan 'won' va MOT 'lost'; hai giai doan nay doi
     ten/mau duoc, khong an, khong xoa, xac suat co dinh 100 / 0;
   - `category` khong doi sau khi tao — nho vay cot `deals.stage_category` (giu bang
     trigger luc ghi `stage`) khong bao gio lech;
   - `key` khong doi sau khi tao (deals.stage tro toi no);
   - luon con it nhat mot giai doan mo dang dung;
   - 'won' va 'lost' luon dung cuoi, theo thu tu do. */

export interface StagePatch {
  label?: string;
  color?: string | null;
  probability?: number;
  gate_bant_min?: number | null;
  require_economic_buyer?: boolean;
  track_poc?: boolean;
  max_days_in_stage?: number | null;
}

function pipelineOf(db: Database, pipelineId: number): Pipeline {
  const pipeline = load(db).find((entry) => entry.id === pipelineId);
  if (!pipeline) throw new HttpError(404, 'Không tìm thấy pipeline');
  return pipeline;
}

function stageIn(db: Database, pipelineId: number, stageId: number): PipelineStage {
  const stage = pipelineOf(db, pipelineId).stages.find((entry) => entry.id === stageId);
  if (!stage) throw new HttpError(404, 'Không tìm thấy giai đoạn');
  return stage;
}

function assertLabelFree(db: Database, pipelineId: number, label: string, exceptId?: number) {
  const folded = label.trim().toLocaleLowerCase('vi');
  const clash = pipelineOf(db, pipelineId).stages.find(
    (stage) => stage.id !== exceptId && stage.label.toLocaleLowerCase('vi') === folded
  );
  if (clash) {
    throw new HttpError(409, `Pipeline đã có giai đoạn "${clash.label}"`, {
      code: 'STAGE_LABEL_TAKEN',
    });
  }
}

function makeStageKey(db: Database, label: string): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'giai_doan';
  const taken = new Set(allStages(db).map((stage) => stage.key));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`;
}

/** Danh so lai vi tri: giai doan mo theo thu tu `openIds`, roi 'won', roi 'lost'. */
function writeOrder(db: Database, pipeline: Pipeline, openIds: number[]): void {
  const won = pipeline.stages.filter((stage) => stage.category === 'won');
  const lost = pipeline.stages.filter((stage) => stage.category === 'lost');
  const update = db.prepare(`UPDATE pipeline_stages SET position = ? WHERE id = ?`);
  [...openIds, ...won.map((stage) => stage.id), ...lost.map((stage) => stage.id)].forEach(
    (id, index) => update.run(index + 1, id)
  );
}

function applyPatch(db: Database, stage: PipelineStage, patch: StagePatch): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (column: string, value: unknown) => {
    sets.push(`${column} = ?`);
    values.push(value);
  };
  if (patch.label !== undefined) put('label', patch.label.trim());
  if (patch.color !== undefined) put('color', patch.color);
  if (patch.probability !== undefined) {
    if (stage.category !== 'open') {
      throw new HttpError(422, 'Xác suất của giai đoạn Thắng/Thua cố định 100% / 0%', {
        code: 'STAGE_PROBABILITY_FIXED',
      });
    }
    put('probability', patch.probability);
  }
  if (patch.gate_bant_min !== undefined) {
    if (stage.category === 'lost' && patch.gate_bant_min !== null) {
      throw new HttpError(422, 'Chuyển sang Thất bại không bao giờ bị cổng chặn', {
        code: 'STAGE_GATE_ON_LOST',
      });
    }
    put('gate_bant_min', patch.gate_bant_min);
  }
  if (patch.require_economic_buyer !== undefined)
    put('require_economic_buyer', patch.require_economic_buyer ? 1 : 0);
  if (patch.track_poc !== undefined) put('track_poc', patch.track_poc ? 1 : 0);
  if (patch.max_days_in_stage !== undefined) put('max_days_in_stage', patch.max_days_in_stage);
  if (sets.length === 0) return;
  sets.push(`updated_at = datetime('now','localtime')`);
  db.prepare(`UPDATE pipeline_stages SET ${sets.join(', ')} WHERE id = ?`).run(...values, stage.id);
}

export function createStage(
  db: Database,
  pipelineId: number,
  input: StagePatch & { label: string; after_stage_id?: number | null }
): PipelineStage {
  const pipeline = pipelineOf(db, pipelineId);
  const label = input.label.trim();
  assertLabelFree(db, pipelineId, label);
  const open = pipeline.stages.filter((stage) => stage.category === 'open');
  /* Mac dinh chen cuoi cac giai doan mo (ngay truoc Thang). */
  const afterIndex =
    input.after_stage_id == null
      ? open.length - 1
      : open.findIndex((stage) => stage.id === input.after_stage_id);
  if (input.after_stage_id != null && afterIndex < 0) {
    throw new HttpError(422, 'Chỉ chèn được sau một giai đoạn đang mở');
  }
  const neighbour = open[afterIndex] ?? open.at(-1);
  const probability = input.probability ?? neighbour?.probability ?? 50;

  let id = 0;
  db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO pipeline_stages (pipeline_id, key, label, category, position, color, probability)
         VALUES (?, ?, ?, 'open', 0, ?, ?)`
      )
      .run(pipelineId, makeStageKey(db, label), label, input.color ?? null, probability);
    id = Number(info.lastInsertRowid);
    const ids = open.map((stage) => stage.id);
    ids.splice(afterIndex + 1, 0, id);
    writeOrder(db, pipeline, ids);
  })();
  invalidatePipeline(db);
  const created = stageIn(db, pipelineId, id);
  const { label: _label, color: _color, probability: _probability, ...rest } = input;
  if (Object.keys(rest).some((key) => key !== 'after_stage_id')) {
    applyPatch(db, created, rest);
    invalidatePipeline(db);
  }
  return stageIn(db, pipelineId, id);
}

export function updateStage(
  db: Database,
  pipelineId: number,
  stageId: number,
  patch: StagePatch
): PipelineStage {
  const stage = stageIn(db, pipelineId, stageId);
  if (patch.label !== undefined) assertLabelFree(db, pipelineId, patch.label, stageId);
  applyPatch(db, stage, patch);
  invalidatePipeline(db);
  return stageIn(db, pipelineId, stageId);
}

/** Sap xep cac giai doan MO; Thang/Thua luon o cuoi nen khong nam trong danh sach. */
export function reorderStages(db: Database, pipelineId: number, openIds: number[]): void {
  const pipeline = pipelineOf(db, pipelineId);
  const open = new Set(
    pipeline.stages.filter((stage) => stage.category === 'open').map((stage) => stage.id)
  );
  if (openIds.length !== open.size || openIds.some((id) => !open.has(id))) {
    throw new HttpError(422, 'Danh sách sắp xếp phải gồm đúng mọi giai đoạn đang mở');
  }
  db.transaction(() => writeOrder(db, pipeline, openIds))();
  invalidatePipeline(db);
}

/**
 * An mot giai doan mo. Co hoi dang nam o do chuyen sang `moveToStageId` trong cung
 * giao dich — mot giai doan an ma van giu co hoi se lam chung bien khoi Kanban.
 *
 * Chuyen o day KHONG qua cong diem: day la thao tac quan tri, khong phai nguoi ban
 * tu danh gia co hoi. `onMove` ghi nhat ky tung co hoi (route giu ngu canh actor).
 */
export function archiveStage(
  db: Database,
  pipelineId: number,
  stageId: number,
  moveToStageId: number | null,
  onMove: (dealId: number, from: string, to: string) => void
): { moved: number } {
  const pipeline = pipelineOf(db, pipelineId);
  const stage = stageIn(db, pipelineId, stageId);
  if (stage.category !== 'open') {
    throw new HttpError(422, 'Giai đoạn Thành công / Thất bại không ẩn được', {
      code: 'STAGE_SYSTEM',
    });
  }
  const remaining = pipeline.stages.filter(
    (entry) => entry.category === 'open' && entry.is_active === 1 && entry.id !== stageId
  );
  if (remaining.length === 0) {
    throw new HttpError(422, 'Pipeline phải còn ít nhất một giai đoạn mở đang dùng', {
      code: 'STAGE_LAST_OPEN',
    });
  }
  const deals = db.prepare(`SELECT id FROM deals WHERE stage = ?`).all(stage.key) as {
    id: number;
  }[];
  let target: PipelineStage | null = null;
  if (deals.length > 0) {
    if (moveToStageId == null) {
      throw new HttpError(422, `Còn ${deals.length} cơ hội ở giai đoạn này — chọn nơi chuyển đến`, {
        code: 'STAGE_HAS_DEALS',
        count: deals.length,
      });
    }
    target = stageIn(db, pipelineId, moveToStageId);
    if (target.id === stageId || target.is_active === 0) {
      throw new HttpError(422, 'Giai đoạn đích phải là một giai đoạn khác đang dùng');
    }
    if (target.category !== 'open') {
      throw new HttpError(422, 'Chỉ chuyển sang một giai đoạn đang mở', {
        code: 'STAGE_TARGET_CLOSED',
      });
    }
  }

  db.transaction(() => {
    if (target) {
      const maxPos = (
        db.prepare(`SELECT MAX(position) AS p FROM deals WHERE stage = ?`).get(target.key) as {
          p: number | null;
        }
      ).p;
      const move = db.prepare(
        `UPDATE deals SET stage = ?, position = ?, stage_entered_at = datetime('now','localtime'),
                updated_at = datetime('now','localtime')
          WHERE id = ?`
      );
      deals.forEach((deal, index) => {
        move.run(target.key, (maxPos ?? 0) + (index + 1) * 1024, deal.id);
        onMove(deal.id, stage.key, target.key);
      });
    }
    db.prepare(
      `UPDATE pipeline_stages SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?`
    ).run(stageId);
  })();
  invalidatePipeline(db);
  return { moved: deals.length };
}

export function restoreStage(db: Database, pipelineId: number, stageId: number): PipelineStage {
  stageIn(db, pipelineId, stageId);
  db.prepare(
    `UPDATE pipeline_stages SET is_active = 1, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(stageId);
  invalidatePipeline(db);
  return stageIn(db, pipelineId, stageId);
}

/**
 * Xoa han — chi khi giai doan chua tung duoc dung: khong co co hoi nao dang o do va
 * nhat ky thay doi khong nhac toi no (bao cao truot giai doan doc tu nhat ky).
 */
export function deleteStage(db: Database, pipelineId: number, stageId: number): void {
  const stage = stageIn(db, pipelineId, stageId);
  if (stage.category !== 'open') {
    throw new HttpError(422, 'Giai đoạn Thành công / Thất bại không xoá được', {
      code: 'STAGE_SYSTEM',
    });
  }
  const used =
    (
      db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE stage = ?`).get(stage.key) as {
        n: number;
      }
    ).n +
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM entity_change_log
            WHERE entity_type = 'deal' AND field = 'stage' AND (old_value = ? OR new_value = ?)`
        )
        .get(stage.key, stage.key) as { n: number }
    ).n;
  if (used > 0) {
    throw new HttpError(409, 'Giai đoạn đã từng được dùng — chỉ ẩn được, không xoá hẳn', {
      code: 'STAGE_IN_USE',
    });
  }
  const remaining = pipelineOf(db, pipelineId).stages.filter(
    (entry) => entry.category === 'open' && entry.is_active === 1 && entry.id !== stageId
  );
  if (remaining.length === 0) {
    throw new HttpError(422, 'Pipeline phải còn ít nhất một giai đoạn mở đang dùng', {
      code: 'STAGE_LAST_OPEN',
    });
  }
  db.prepare(`DELETE FROM pipeline_stages WHERE id = ?`).run(stageId);
  invalidatePipeline(db);
}

/** So co hoi dang o tung giai doan — hien canh moi dong o man cau hinh. */
export function stageDealCounts(db: Database): Record<string, number> {
  const rows = db.prepare(`SELECT stage, COUNT(*) AS n FROM deals GROUP BY stage`).all() as {
    stage: string;
    n: number;
  }[];
  return Object.fromEntries(rows.map((row) => [row.stage, row.n]));
}
