/**
 * Danh muc dong (v62).
 *
 * Moi danh muc la mot danh sach gia tri ma quan tri vien tu them, sua ten, an,
 * sap xep va gop tren giao dien (Cai dat -> Danh muc). Gia tri nam o bang
 * `picklist_items`; tep nay chi khai bao DANH MUC NAO ton tai va COT NAO dung no,
 * vi them mot danh muc moi luon di kem ma (o nao hien thi, cot nao luu).
 *
 * `storage`:
 *  - 'key'   — cot luu `item_key` (khoa on dinh). Doi ten muc khong dung toi du lieu.
 *  - 'label' — cot luu chinh NHAN hien thi. Dung cho cac cot von la chu tu do va
 *    duoc doc tho o nhieu noi (ngu canh AI, tim kiem, so sanh cung nganh, tra cuu
 *    cong ty bang AI). Doi ten hay gop muc thi may chu cap nhat lai moi cot trong
 *    `usages` trong cung mot giao dich.
 *
 * `usages` la nguon su that cho ba viec: dem so ban ghi dang dung mot muc, gop
 * muc, va kiem tra gia tri khi ghi.
 */
export const PICKLIST_KEYS = [
  'lost_reason',
  'interaction_type',
  'doc_type',
  'customer_industry',
  'customer_size',
  'customer_source',
  'deal_source',
] as const;
export type PicklistKey = (typeof PICKLIST_KEYS)[number];

export type PicklistStorage = 'key' | 'label';

export interface PicklistDefinition {
  storage: PicklistStorage;
  /** Cac cot [bang, cot] luu gia tri cua danh muc nay. */
  usages: readonly (readonly [string, string])[];
  /**
   * Muc he thong: ma nguon can no ton tai (vd 'other' la gia tri mac dinh cua tai
   * lieu). Khong an, khong xoa, khong gop di duoc; van doi ten duoc.
   */
  systemKeys: readonly string[];
}

export const PICKLISTS: Record<PicklistKey, PicklistDefinition> = {
  lost_reason: { storage: 'key', usages: [['deals', 'lost_reason']], systemKeys: ['other'] },
  interaction_type: {
    storage: 'key',
    usages: [['interactions', 'type']],
    systemKeys: ['other'],
  },
  doc_type: {
    storage: 'key',
    usages: [['documents', 'doc_type']],
    /* 'contract': tep tai len tu trang Hop dong luon mang loai nay (routes/contracts.ts). */
    systemKeys: ['contract', 'other'],
  },
  // v63: bon cot von la chu tu do
  customer_industry: { storage: 'label', usages: [['customers', 'industry']], systemKeys: [] },
  customer_size: { storage: 'label', usages: [['customers', 'size']], systemKeys: [] },
  /* 'contract': khach hang tao tu luong tai hop dong len. */
  customer_source: {
    storage: 'label',
    usages: [['customers', 'source']],
    systemKeys: ['contract'],
  },
  /* 'renewal': co hoi gia han tao tu hop dong sap het han. */
  deal_source: { storage: 'label', usages: [['deals', 'source']], systemKeys: ['renewal'] },
};

export function isPicklistKey(value: string): value is PicklistKey {
  return (PICKLIST_KEYS as readonly string[]).includes(value);
}

export interface PicklistItem {
  id: number;
  list_key: PicklistKey;
  item_key: string;
  label: string;
  color: string | null;
  position: number;
  is_active: 0 | 1;
  is_system: 0 | 1;
}
