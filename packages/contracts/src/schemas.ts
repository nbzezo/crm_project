import { z } from 'zod';
import { PRIORITIES } from './index.js';

/** Runtime schemas song o subpath rieng de client chi dung type/constant khong phai tai Zod. */
export const entityLinksSchema = z.object({
  customer_id: z.number().int().positive().nullable().optional(),
  contact_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
  contract_id: z.number().int().positive().nullable().optional(),
  quotation_id: z.number().int().positive().nullable().optional(),
  card_id: z.number().int().positive().nullable().optional(),
  service_id: z.number().int().positive().nullable().optional(),
});
export type EntityLinks = z.infer<typeof entityLinksSchema>;

/** Khoa lien ket mot cong viec co the mang. `card_id`/`service_id` khong ap dung cho Task. */
export const taskLinksSchema = entityLinksSchema.pick({
  customer_id: true,
  contact_id: true,
  deal_id: true,
  contract_id: true,
  quotation_id: true,
});
export type TaskLinks = z.infer<typeof taskLinksSchema>;
export const TASK_LINK_KEYS = [
  'customer_id',
  'contact_id',
  'deal_id',
  'contract_id',
  'quotation_id',
] as const satisfies readonly (keyof TaskLinks)[];

const taskDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngay phai dang YYYY-MM-DD')
  .nullable();

/**
 * Hop dong tao Task duy nhat, dung chung cho route /api/cards, hanh dong AI va client.
 *
 * Truoc day moi noi tu dinh nghia mot tap truong khac nhau nen `description` va
 * `contact_id` bi rot mat o route chinh trong khi cac duong ghi khac van luu.
 */
export const createTaskInputSchema = taskLinksSchema.extend({
  list_id: z.number().int().positive().nullable().optional(),
  parent_id: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1, 'Tieu de khong duoc de trong').max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  start_date: taskDate.optional(),
  due_date: taskDate.optional(),
  label_ids: z.array(z.number().int().positive()).max(50).optional(),
  checklist: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const apiErrorSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .catchall(z.unknown());
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
