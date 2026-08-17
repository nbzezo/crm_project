/**
 * Cau hinh quy trinh ban giao (v24).
 *
 * Dat o router rieng thay vi trong `routes/deals.ts`: mot duong dan dang
 * `/api/deals/settings/handover` se khop truoc voi `GET /:id` va lam `intParam`
 * nem 400 cho chuoi 'settings'. Mount tai `/api/settings` de dung canh
 * `/api/settings/scoring` ma router scoring da co.
 */
import { Router } from 'express';
import { z } from 'zod';
import { CARD_STATUSES } from '@workflow/contracts';
import { db } from '../db/connection.ts';
import { HttpError, parseBody } from '../lib/validate.ts';
import { getHandoverSettings, saveHandoverSettings } from '../services/handoverService.ts';
import { getDeliverySettings, saveDeliverySettings } from '../services/deliveryService.ts';

const router = Router();

const templateItemSchema = z.object({
  content: z.string().trim().min(1, 'Noi dung muc khong duoc de trong').max(500),
  required: z.boolean(),
});

const handoverSchema = z.object({
  templates: z
    .record(z.string().trim().min(1).max(50), z.array(templateItemSchema).max(50))
    .optional(),
  sla_days: z.number().int().min(1).max(365).optional(),
});

router.get('/handover', (_req, res) => {
  res.json(getHandoverSettings(db));
});

router.put('/handover', (req, res) => {
  const body = parseBody(handoverSchema, req);

  /*
   * Bo mau 'default' la bat buoc va khong duoc rong.
   *
   * `applyHandoverTemplate` roi ve no khi khong khop loai giai phap nao, nen mat
   * khoa nay se lam moi co hoi khong thuoc loai da khai bao khong the tao duoc
   * checklist — mot loi chi lo ra rat lau sau khi ai do luu cau hinh.
   */
  if (body.templates) {
    const fallback = body.templates.default;
    if (!fallback || fallback.length === 0) {
      throw new HttpError(422, 'Bộ mẫu "default" là bắt buộc và phải có ít nhất một mục', {
        code: 'HANDOVER_DEFAULT_REQUIRED',
      });
    }
  }

  saveHandoverSettings(db, body as Record<string, unknown>);
  res.json(getHandoverSettings(db));
});

/* ---------- Cau hinh lop Delivery (v26) ---------- */

const deliverySchema = z.object({
  classification: z
    .object({
      contract_value_vnd: z.number().int().min(0),
      duration_days: z.number().int().min(1).max(3650),
      phase_count: z.number().int().min(1).max(100),
      team_count: z.number().int().min(1).max(100),
    })
    .optional(),
  board_templates: z
    .record(
      z.string().trim().min(1).max(50),
      z
        .array(
          z.object({
            name: z.string().trim().min(1).max(120),
            /* null = cot khong mang nghia vong doi, dung nhu `lists.status_mapping`. */
            status: z.enum(CARD_STATUSES).nullable(),
          })
        )
        .min(1)
        .max(30)
    )
    .optional(),
});

router.get('/delivery', (_req, res) => {
  res.json(getDeliverySettings(db));
});

router.put('/delivery', (req, res) => {
  const body = parseBody(deliverySchema, req);

  /*
   * Hai bo mau 'large' va 'small' la bat buoc: chung tuong ung voi Mo hinh A va
   * B cua dac ta 6.2, va man hinh phan loai chao dung hai khoa nay. Mat mot trong
   * hai se lam nut "Dung bo mau nay" khong lam gi ma khong noi tai sao.
   */
  if (body.board_templates) {
    for (const key of ['large', 'small']) {
      const items = body.board_templates[key];
      if (!items || items.length === 0) {
        throw new HttpError(422, `Bộ mẫu "${key}" là bắt buộc và phải có ít nhất một danh sách`, {
          code: 'BOARD_TEMPLATE_REQUIRED',
        });
      }
    }
  }

  saveDeliverySettings(db, body as Record<string, unknown>);
  res.json(getDeliverySettings(db));
});

export default router;
