import { z } from 'zod';

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

export const apiErrorSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .catchall(z.unknown());
export type ApiErrorPayload = z.infer<typeof apiErrorSchema>;
