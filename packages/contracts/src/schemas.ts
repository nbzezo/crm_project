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
  /**
   * Nguoi phu trach — TRUC RIENG, co y khong nam trong `taskLinksSchema`.
   *
   * `taskLinksSchema` la tap khoa di qua assertEntityLinks, noi bat moi lien ket
   * phai cung mot khach hang. Nguoi phu trach thi nguoc lai: mot viec VE khach
   * hang A thuong xuyen do nhan su cong ty MINH lam. Dua khoa nay vao do se lam
   * moi task giao ra ngoai pham vi khach hang bi 422 CROSS_CUSTOMER_LINK.
   */
  assignee_contact_id: z.number().int().positive().nullable().optional(),
  /**
   * Goi y du an de CHON BANG mac dinh — khong duoc ghi xuong the.
   *
   * Tu v19 mot viec thuoc du an cua bang chua no, khong co cot rieng. Khoa nay
   * chi giup `resolveDefaultList` tha viec vao dung bang khi nguoi dung tao tu
   * trang mot du an ma khong chi ro danh sach.
   */
  project_id: z.number().int().positive().nullable().optional(),
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

/**
 * Ghi chu hop cua Co hoi / Du an.
 *
 * `deal_id`/`project_id` deu tuy chon o tang schema — phai co it nhat mot cai, kiem
 * bang `.refine` vi mot Co hoi da gan Du an trien khai co the mang ca hai. `project_id`
 * KHONG nam trong `entityLinksSchema` (assertEntityLinks khong biet cot nay) nen route
 * phai tu goi them assertProjectCustomerLink.
 *
 * `content_json` la chuoi JSON block cua trinh soan thao phia client (BlockNote) —
 * server luu nguyen van, khong parse. `content_text` la ban chu thuan client tu suy
 * ra tu content_json, dung de tim kiem va lam ngu canh AI.
 */
/** Truong tho — dung rieng de route con goi duoc `.partial()` cho PATCH (autosave). */
export const meetingNoteFieldsSchema = z.object({
  customer_id: z.number().int().positive().nullable().optional(),
  deal_id: z.number().int().positive().nullable().optional(),
  project_id: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1, 'Tieu de khong duoc de trong').max(300),
  meeting_at: z.string().min(10).max(30).nullable().optional(),
  content_json: z.string().max(2_000_000).optional(),
  content_text: z.string().max(500_000).optional(),
  attendee_contact_ids: z.array(z.number().int().positive()).max(100).optional(),
});
/**
 * Truoc day bat buoc `deal_id` hoac `project_id` (xem lich su git) — tu v31 mot
 * ghi chu co the doc lap (tao nhanh tu trang "Ghi chu", chua gan Co hoi/Du an
 * nao). Alias truc tiep sang `meetingNoteFieldsSchema`, khong `.refine()` nua.
 */
export const meetingNoteInputSchema = meetingNoteFieldsSchema;
export type MeetingNoteInput = z.infer<typeof meetingNoteInputSchema>;

export const apiErrorSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .catchall(z.unknown());
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
