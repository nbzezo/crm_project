/**
 * Danh muc quyen — ban ke NHUNG GI UNG DUNG LAM DUOC.
 *
 * Ranh gioi quan trong nhat cua ca he phan quyen nam o day:
 *
 * - `resource` / `action` / `scope` la CODE. Mot resource khong co man hinh va
 *   endpoint tuong ung thi co tao trong CSDL cung vo nghia, nen them resource =
 *   them tinh nang = co code di kem. De o packages/contracts vi client va server
 *   phai doc cung mot danh sach; lech nhau la nguon loi phan quyen kinh dien
 *   (menu an mot dang, may chu chan mot neo).
 *
 * - `positions` va tung o trong ma tran quyen la DU LIEU. Tao vi tri moi, doi
 *   scope mot o, xoa vi tri, gan nhieu vi tri cho mot nguoi — tat ca lam tren UI
 *   luc chay, ghi thang vao CSDL. Khong migration, khong deploy.
 *
 * File nay khong chua nhan tieng Viet: nhan hien thi nam o client/src/i18n,
 * cung cho voi nhan cua STAGES / SCORE_FACTORS.
 */

export const PERMISSION_RESOURCES = [
  // CRM
  'customers',
  'contacts',
  'deals',
  'contracts',
  'quotations',
  'revenues',
  'services',
  // Cong viec va trien khai
  'projects',
  'boards',
  'tasks',
  'documents',
  'notes',
  'interactions',
  // Bao cao — tach rieng khoi du lieu goc vi "duoc xem bao cao tong hop" va
  // "duoc mo tung ban ghi" la hai cau hoi khac nhau. Mot Giam doc Khoi can con
  // so cua ca khoi ma khong nhat thiet can mo tung co hoi cua tung nhan vien.
  'report.sales',
  'report.revenue',
  'report.tasks',
  'report.projects',
  // Quan tri
  'admin.users',
  'admin.org',
  'admin.positions',
  // Cau hinh
  'settings.app',
  'settings.ai',
  'settings.email',
  'settings.telegram',
  // Khac
  'data.export',
  'ai',
  /* Cho san cho module cong no day du (hoa don, phieu thu, tuoi no). Chua co man
     hinh nao dung toi; khai truoc de khi lam khong phai them migration quyen. */
  'ar',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const PERMISSION_ACTIONS = ['read', 'create', 'update', 'delete', 'export'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

/**
 * Pham vi du lieu cua mot quyen.
 *
 * - `none`   khong duoc dung
 * - `own`    chi ban ghi minh so huu
 * - `unit`   ban ghi cua nguoi trong DUNG don vi minh ngoi
 * - `subtree` don vi minh ngoi VA moi don vi con — day la cai lam nen "phan cap"
 * - `all`    toan cong ty
 */
export const PERMISSION_SCOPES = ['none', 'own', 'unit', 'subtree', 'all'] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

/** Thu tu de gop nhieu vi tri: mot nguoi giu hai vi tri thi duoc pham vi RONG HON. */
export const SCOPE_RANK: Record<PermissionScope, number> = {
  none: 0,
  own: 1,
  unit: 2,
  subtree: 3,
  all: 4,
};

export function widerScope(a: PermissionScope, b: PermissionScope): PermissionScope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

const CRUD = ['read', 'create', 'update', 'delete'] as const;
const CRUD_EXPORT = ['read', 'create', 'update', 'delete', 'export'] as const;
const READ_EXPORT = ['read', 'export'] as const;
const READ_UPDATE = ['read', 'update'] as const;

/**
 * Action nao co nghia voi resource nao.
 *
 * Ma tran quyen tren UI chi ve nhung o co trong bang nay — hien mot o "xoa bao
 * cao" la hua mot thu khong ton tai, va nguoi cau hinh se tuong minh vua cam duoc
 * mot dieu gi do.
 */
export const RESOURCE_ACTIONS: Record<PermissionResource, readonly PermissionAction[]> = {
  customers: CRUD_EXPORT,
  contacts: CRUD,
  deals: CRUD_EXPORT,
  contracts: CRUD_EXPORT,
  quotations: CRUD,
  revenues: CRUD_EXPORT,
  services: CRUD,
  projects: CRUD,
  boards: CRUD,
  tasks: CRUD_EXPORT,
  documents: CRUD,
  notes: CRUD,
  interactions: CRUD,
  'report.sales': READ_EXPORT,
  'report.revenue': READ_EXPORT,
  'report.tasks': READ_EXPORT,
  'report.projects': READ_EXPORT,
  'admin.users': READ_UPDATE,
  'admin.org': READ_UPDATE,
  'admin.positions': READ_UPDATE,
  'settings.app': READ_UPDATE,
  'settings.ai': READ_UPDATE,
  'settings.email': READ_UPDATE,
  'settings.telegram': READ_UPDATE,
  'data.export': ['export'],
  ai: READ_UPDATE,
  ar: CRUD_EXPORT,
};

/** Nhom resource de ve ma tran tren UI cho doc duoc, khong anh huong toi thuc thi. */
export const RESOURCE_GROUPS: { id: string; resources: readonly PermissionResource[] }[] = [
  {
    id: 'crm',
    resources: ['customers', 'contacts', 'deals', 'contracts', 'quotations', 'interactions'],
  },
  { id: 'revenue', resources: ['revenues', 'services', 'ar'] },
  { id: 'work', resources: ['projects', 'boards', 'tasks', 'documents', 'notes'] },
  {
    id: 'reports',
    resources: ['report.sales', 'report.revenue', 'report.tasks', 'report.projects'],
  },
  { id: 'admin', resources: ['admin.users', 'admin.org', 'admin.positions'] },
  {
    id: 'settings',
    resources: [
      'settings.app',
      'settings.ai',
      'settings.email',
      'settings.telegram',
      'data.export',
      'ai',
    ],
  },
];

/** Mot dong trong ma tran quyen. Khong co dong = `none` (xem chu thich o migrate-v39.sql). */
export interface PositionPermission {
  resource: PermissionResource;
  action: PermissionAction;
  scope: PermissionScope;
}

/** Ho so quyen cua nguoi dang dang nhap, tra kem GET /api/auth/me. */
export type PermissionMap = Partial<Record<string, PermissionScope>>;

/** Khoa dung trong PermissionMap. Mot ham de hai ben khong tu ghep chuoi khac nhau. */
export function permissionKey(resource: PermissionResource, action: PermissionAction): string {
  return `${resource}:${action}`;
}
