export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

/**
 * Giai doan cua mot co hoi.
 *
 * 'poc' (v27) nam giua 'discussing' va 'quoted' theo dung S03 cua dac ta: khach
 * hang dang thu nghiem giai phap thi da qua giai doan lam ro nhu cau, nhung chua
 * the bao gia chac.
 *
 * KHONG co 'on_hold' o day du dac ta xep no ngang hang. Tam dung la mot CO rieng
 * (`deals.on_hold`) vi mot co hoi dung lai VAN dang nam o mot cho trong pipeline
 * — dung giua dam phan khac han dung ngay sau bao gia, va bien no thanh mot giai
 * doan se xoa mat chinh thong tin do.
 */
export const STAGES = [
  'lead',
  'approaching',
  'discussing',
  'poc',
  'quoted',
  'negotiating',
  'won',
  'lost',
] as const;
export type Stage = (typeof STAGES)[number];

/** Xac suat mac dinh cua tung giai doan; dung chung cho API va optimistic UI. */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  lead: 10,
  approaching: 20,
  discussing: 40,
  /* PoC dat giua 'discussing' (40) va 'quoted' (60): khach da bo cong thu nghiem
     nen kha nang that hon, nhung chua co bao gia nao duoc chap nhan. */
  poc: 50,
  quoted: 60,
  negotiating: 80,
  won: 100,
  lost: 0,
};

/**
 * So ngay khong co hoat dong thi coi mot co hoi la "nguoi lanh" (FR-PIP-04).
 *
 * Dung chung server (routes/views.ts, danh sach "Can chu y") va client
 * (DealCard.tsx, vien canh bao tren the Kanban) — hai noi TUNG hard-code rieng
 * gia tri nay va co the troi khoi nhau khi mot ben doi ma ben kia quen sua.
 */
export const STALE_DAYS = 14;

/**
 * Nguong lat o cua ma tran co hoi (BANT/4P). Moi truc toi da 12 diem.
 *
 * Dung chung server (lib/scoring.ts, tinh quadrant that su cua tung co hoi) va
 * client (OpportunityMatrix.tsx, ve 4 vung nen cua bieu do) — cung ly do voi
 * STALE_DAYS o tren.
 */
export const QUADRANT_CUTOFF = 7;

export const LOST_REASONS = [
  'price',
  'competitor',
  'no_budget',
  'project_stopped',
  'solution_mismatch',
  'requirement_unmet',
  'no_contact',
  'bad_timing',
  'self_build',
  'other',
] as const;

export const INTERACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'demo',
  'proposal',
  'followup',
  'note',
  'zalo',
  'other',
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const CONTRACT_STATUSES = ['draft', 'signing', 'active', 'expired', 'terminated'] as const;
export const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'reviewing',
  'revision',
  'accepted',
  'rejected',
] as const;
export const DOC_TYPES = [
  'proposal',
  'quotation',
  'contract',
  'nda',
  'meeting_minute',
  'requirement',
  'profile',
  'other',
] as const;

export const CONTRACT_KINDS = ['new', 'expansion'] as const;
export type ContractKind = (typeof CONTRACT_KINDS)[number];
export const CONTRACT_TERMS = ['long', 'short', 'trial', 'other'] as const;
export type ContractTerm = (typeof CONTRACT_TERMS)[number];
export const SERVICE_STATUSES = ['using', 'pending', 'paused', 'stopped'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];
export const REVENUE_STAGES = ['forecast', 'reconciled', 'invoiced', 'paid'] as const;
export type RevenueStage = (typeof REVENUE_STAGES)[number];

export const LABEL_ENTITIES = ['card', 'customer', 'deal', 'contact', 'contract'] as const;
export type LabelEntity = (typeof LABEL_ENTITIES)[number];

/**
 * Loai to chuc trong so danh ba.
 *
 * `customers` vua la danh sach khach hang vua la so danh ba to chuc de nguoi phu
 * trach mot cong viec co the thuoc bat ky ben nao. Chi 'customer' moi la doi tuong
 * cua pipeline / doanh thu / bao cao CRM — cac truy van liet ke khach hang phai loc
 * theo cot nay, neu khong "cong ty toi" se lot vao forecast.
 */
export const ORG_KINDS = ['own', 'customer', 'partner', 'vendor'] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

/**
 * Vong doi mot cong viec (v16).
 *
 * `is_done` van ton tai va la nguon cho ~80 truy van cu; hai cot rang buoc nhau
 * bang bat bien is_done = 1 <=> status = 'done'. Chi setCardStatus() duoc ghi.
 *
 * 'waiting_customer' va 'blocked' la ly do ton tai cua ca danh sach nay: mot viec
 * dang cho ben ngoai khong phai viec bi bo quen, va phan biet duoc hai thu do moi
 * biet nen nhac ai.
 */
export const CARD_STATUSES = [
  'todo',
  'doing',
  'waiting_customer',
  'blocked',
  'review',
  'done',
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** Kenh da dung de nhac mot nguoi phu trach. */
export const NUDGE_CHANNELS = ['zalo', 'email', 'call', 'meeting', 'other'] as const;
export type NudgeChannel = (typeof NUDGE_CHANNELS)[number];

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'done', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Suc khoe du an — tinh khi doc, khong bao gio luu.
 *
 * Luu lai se lap tuc lac hau: mot du an chuyen tu xanh sang do chi vi hom nay la
 * ngay qua `plan_end`, khong co ai sua gi ca. Khong co su kien nao de kich hoat
 * viec cap nhat, nen gia tri luu se sai am tham.
 */
export const PROJECT_HEALTHS = ['unknown', 'green', 'amber', 'red'] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

/**
 * So rui ro cua du an (v26) — mot bang cho bon loai.
 *
 * Chung co cung vong doi, cung nguoi chiu trach nhiem, cung han xu ly va nguoi
 * dung luon xem chung tren cung mot man hinh "co gi dang can tro du an nay".
 * 'change' la Change Request cua dac ta 7.4: doi pham vi sau baseline phai co
 * ban ghi, khong sua am tham.
 */
export const RISK_KINDS = ['risk', 'issue', 'change', 'decision'] as const;
export type RiskKind = (typeof RISK_KINDS)[number];
export const RISK_SEVERITIES = ['low', 'medium', 'high'] as const;
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];
export const RISK_STATUSES = ['open', 'mitigating', 'closed'] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

/** Hai mo hinh quan ly trien khai cua dac ta 6.2. */
export const DELIVERY_MODELS = ['A', 'B'] as const;
export type DeliveryModel = (typeof DELIVERY_MODELS)[number];

/**
 * Ghi chu nhanh (Quick Notes, v32) — module doc lap voi Ghi chu hop (meeting_notes).
 *
 * `QUICK_NOTE_RELATION_TYPES` la tap CRM Object gan duoc SAU khi tao (FR15), co y
 * KHONG co 'card' — BRD chi liet ke Customer/Contact/Lead/Deal/Project o man "More
 * Options" ("Lead" o day chinh la `customers.status = 'prospect'`, khong phai bang
 * rieng). Muon lien ket toi mot cong viec cu the thi dung "Convert thanh Task".
 */
export const QUICK_NOTE_RELATION_TYPES = ['customer', 'contact', 'deal', 'project'] as const;
export type QuickNoteRelationType = (typeof QUICK_NOTE_RELATION_TYPES)[number];

export const QUICK_NOTE_REMINDER_STATUSES = [
  'pending',
  'triggered',
  'completed',
  'cancelled',
] as const;
export type QuickNoteReminderStatus = (typeof QUICK_NOTE_REMINDER_STATUSES)[number];

export const QUICK_NOTE_CONVERT_TARGETS = ['task', 'crm_note'] as const;
export type QuickNoteConvertTarget = (typeof QUICK_NOTE_CONVERT_TARGETS)[number];

/**
 * Mau "giay ghi chu" nguoi dung chon rieng cho mot Quick Note (v33) — de trong
 * (`null`) thi client tu suy mau theo id (xem palette.ts), dat gia tri o day
 * la ghi de. Khoa on dinh, KHONG phai chi so mang — doi thu tu mau trong
 * palette.ts sau nay khong lam sai lech du lieu da luu.
 */
export const QUICK_NOTE_COLORS = [
  'yellow',
  'green',
  'pink',
  'purple',
  'blue',
  'peach',
  'red',
  'teal',
  'indigo',
  'brown',
  'gray',
  'lime',
] as const;
export type QuickNoteColorKey = (typeof QUICK_NOTE_COLORS)[number];
