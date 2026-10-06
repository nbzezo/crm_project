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
