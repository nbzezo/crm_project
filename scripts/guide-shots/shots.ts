import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';

/*
 * Danh sach anh cua tai lieu huong dan.
 *
 * Day la nguon su thuc duy nhat: ten o day phai khop ten anh trong cac bai
 * Markdown, va test client/src/lib/guideNav.test.ts bat ca hai phia — anh thieu
 * thi bai vo, anh khong bai nao dung thi coi nhu rac.
 *
 * Them mot anh: them mot muc o day, chay `npm run guide:shots`, roi chen
 * `![chu thich](/guide/img/<ten>.jpg)` vao bai.
 */

export const IMG_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/public/guide/img'
);

export interface Shot {
  /** Ten file, khong duoi. */
  name: string;
  route: string;
  /** Chup rieng mot phan tu thay vi ca khung nhin. */
  clip?: string;
  /** png cho anh cat nho (chu net hon), jpeg cho anh ca man hinh (file nhe hon). */
  type?: 'png' | 'jpeg';
  /** Bam/doi truoc khi chup. */
  prepare?: (page: Page) => Promise<void>;
  /** Khong can dang nhap (man hinh dang nhap). */
  anonymous?: boolean;
  /** Khung nhin rieng, vd. thanh ben cao hon 800px thi phai noi khung ra moi chup du. */
  viewport?: { width: number; height: number };
}

/** Doi sang mot tab con trong trang chi tiet. */
async function openTab(page: Page, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(label, 'i') }).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click();
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/*
 * Trang chi tiet mo thang bang id 1 chu khong bam vao dong dau danh sach: danh
 * sach khach hang va pipeline dieu huong bang onClick chu khong phai the <a>,
 * nen khong co gi de bam cho chac. Du lieu mau luon bat dau tu id 1.
 */

/* ------------------------------------------------------------------ *
 * Du lieu mau rieng cua bo chup anh
 *
 * `npm run seed` khong dung san noi dung cho Ghi chu nhanh, So rui ro va Giai
 * doan, nen ba man hinh do tu dung lay qua `page.request` (dung chung cookie
 * voi trang) roi `page.reload()` cho giao dien doc lai.
 *
 * Moi ham phai chay lai duoc nhieu lan: chup le mot anh bang `--grep` KHONG
 * don CSDL, nen ham nao cung kiem truoc va bo qua muc da co. Toan bo noi dung
 * duoi day la du lieu bia dung cho tai lieu.
 * ------------------------------------------------------------------ */

async function getJson<T>(page: Page, url: string): Promise<T> {
  const res = await page.request.get(url);
  if (!res.ok()) throw new Error(`GET ${url} that bai: ${res.status()}`);
  return (await res.json()) as T;
}

async function postJson<T>(page: Page, url: string, data: unknown): Promise<T> {
  const res = await page.request.post(url, { data });
  if (!res.ok()) throw new Error(`POST ${url} that bai: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Nap lai trang sau khi tao du lieu bang API — giao dien khong tu biet. */
async function reload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

/** BlockNote nhan `content` dang chuoi cho mot doan van. */
const paragraphs = (lines: string[]): string =>
  JSON.stringify(lines.map((text) => ({ type: 'paragraph', content: text })));

const QUICK_NOTES = [
  {
    title: 'Gọi lại anh Khoa trước 15h',
    lines: [
      'Khách hỏi bản 20 người dùng còn giữ giá cũ tới hết quý không.',
      'Nếu còn thì gửi lại báo giá trong hôm nay.',
    ],
    tags: ['cần gọi'],
    color: 'yellow',
    pinned: true,
  },
  {
    title: 'Chuẩn bị buổi demo thứ Năm',
    lines: ['Dựng sẵn dữ liệu mẫu cho phân hệ Kho.', 'Nhờ chị Hà chuẩn bị phòng họp tầng 3.'],
    tags: ['demo'],
    color: 'green',
    pinned: false,
  },
  {
    title: 'Xin lại số liệu quý III',
    lines: ['Bảng doanh thu theo chi nhánh của bên Kế toán vẫn thiếu tháng 9.'],
    tags: ['báo cáo'],
    color: 'blue',
    pinned: false,
  },
  {
    title: 'Ý kiến khách sau buổi khảo sát',
    lines: [
      'Họ muốn màn Công việc lọc được theo nhóm.',
      'Chưa hứa gì — ghi lại để bàn trong cuộc họp sản phẩm.',
    ],
    tags: ['sản phẩm'],
    color: 'pink',
    pinned: false,
  },
  {
    title: 'Mật khẩu wifi phòng họp tầng 3',
    lines: ['Hỏi lễ tân mỗi lần đều mất năm phút.'],
    tags: ['vặt'],
    color: 'gray',
    pinned: false,
  },
  {
    title: 'Hỏi bên Kỹ thuật về giới hạn tệp đính kèm',
    lines: [
      'Khách muốn gửi bản vẽ 80 MB qua liên kết chia sẻ.',
      'Cần biết mức trần hiện tại trước khi trả lời.',
    ],
    tags: ['cần hỏi'],
    color: 'teal',
    pinned: false,
  },
];

/** Ghi chu dung lam vi du cho anh ghi am — mo cua so bang chinh tieu de nay. */
const VOICE_NOTE_TITLE = QUICK_NOTES[1].title;

async function seedQuickNotes(page: Page): Promise<void> {
  const existing = await getJson<{ title: string }[]>(page, '/api/quick-notes');
  const have = new Set(existing.map((note) => note.title));

  for (const note of QUICK_NOTES) {
    if (have.has(note.title)) continue;
    const created = await postJson<{ id: number }>(page, '/api/quick-notes', {
      title: note.title,
      content_json: paragraphs(note.lines),
      content_text: note.lines.join('\n'),
      tags: note.tags,
      color: note.color,
    });
    if (note.pinned) {
      await postJson(page, `/api/quick-notes/${created.id}/pin`, { pinned: true });
    }
  }
}

/** Mo bang Ghi chu nhanh tu nut tren thanh tren. */
async function openQuickNotesBoard(page: Page): Promise<void> {
  await page.locator('header button[aria-label="Ghi nhanh"]').first().click();
  await page
    .getByRole('dialog', { name: 'Ghi chú nhanh' })
    .waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Mo mot ghi chu nhanh va cho thanh cong cu ghi am san sang.
 *
 * Thu lai vai lan la CO Y: lan dau tien trong mot phien `vite dev`, o soan thao
 * BlockNote (nap lazy) moi duoc go bo phu thuoc, va Vite bat trang tai lai toan
 * bo ngay giua chung — bang vua mo bien mat. Lan thu hai da co san trong cache
 * nen mo mot phat an.
 */
async function openQuickNoteEditor(page: Page): Promise<Locator> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await openQuickNotesBoard(page);
    /* `exact` la bat buoc: the ghi chu nam trong mot vo keo-tha cung mang
       role="button" va ten bat dau bang dung chuoi nay. */
    await page
      .getByRole('button', { name: `Mở ghi chú: ${VOICE_NOTE_TITLE}`, exact: true })
      .click();
    const note = page.getByRole('dialog', { name: VOICE_NOTE_TITLE });
    try {
      await note
        .getByRole('button', { name: 'Ghi âm' })
        .waitFor({ state: 'visible', timeout: 20_000 });
      return note;
    } catch {
      await page.waitForLoadState('networkidle').catch(() => undefined);
    }
  }
  throw new Error('Khong mo duoc o soan thao cua ghi chu nhanh');
}

/** Ngay cach hom nay `days` ngay, dang YYYY-MM-DD. */
function dayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/* Bon loai muc cua so rui ro, moi loai mot muc — bai viet giai thich ca bon. */
const RISKS = [
  {
    kind: 'issue',
    title: 'Dữ liệu danh mục khách gửi sai định dạng ngày',
    detail: 'Hai nghìn dòng dùng dd/mm/yyyy lẫn mm/dd/yyyy, phải chuẩn hóa trước khi nhập.',
    severity: 'high',
    status: 'mitigating',
    due_date: dayOffset(-3),
  },
  {
    kind: 'risk',
    title: 'Chưa có môi trường thử nghiệm phía khách',
    detail: 'Nếu sang tuần vẫn chưa có máy chủ thử nghiệm thì mốc nghiệm thu đợt 1 sẽ trượt.',
    severity: 'high',
    status: 'open',
    due_date: dayOffset(5),
  },
  {
    kind: 'change',
    title: 'Khách đề nghị thêm báo cáo theo chi nhánh',
    detail: 'Ngoài phạm vi hợp đồng. Cần báo giá bổ sung trước khi nhận.',
    severity: 'medium',
    status: 'open',
    due_date: dayOffset(12),
  },
  {
    kind: 'decision',
    title: 'Chốt đăng nhập bằng tài khoản nội bộ, chưa nối SSO',
    detail: 'Bên khách chưa sẵn sàng mở SSO trong năm nay.',
    severity: 'low',
    status: 'closed',
    due_date: null,
    resolution: 'Hai bên thống nhất dùng tài khoản nội bộ cho đợt 1, xem lại SSO ở đợt 2.',
  },
];

async function seedProjectRisks(page: Page): Promise<void> {
  const existing = await getJson<{ title: string }[]>(page, '/api/projects/1/risks');
  const have = new Set(existing.map((risk) => risk.title));
  for (const risk of RISKS) {
    if (have.has(risk.title)) continue;
    await postJson(page, '/api/projects/1/risks', risk);
  }
}

/*
 * Giai doan = mot luong viec co moc ban giao, nen moi giai doan la mot bang.
 * Moi bang them vai the (`done` the da xong) de cot "x/y viec" va trang thai
 * dung han / qua han co gi that de hien, thay vi "0/0 viec" tren moi dong.
 */
const PHASES = [
  {
    name: 'Đợt 1 — Khảo sát và chuẩn hóa dữ liệu',
    milestone_date: dayOffset(-6),
    cards: [
      { title: 'Thu thập danh mục hàng hóa', done: true },
      { title: 'Chuẩn hóa định dạng ngày', done: true },
      { title: 'Đối chiếu số dư đầu kỳ', done: false },
    ],
  },
  {
    name: 'Đợt 2 — Bàn giao phân hệ Kho',
    milestone_date: dayOffset(9),
    cards: [
      { title: 'Cấu hình mã kho và vị trí', done: true },
      { title: 'Chạy thử nhập xuất tồn', done: false },
      { title: 'Đào tạo thủ kho', done: false },
    ],
  },
  {
    name: 'Đợt 3 — Bàn giao phân hệ Kế toán',
    milestone_date: dayOffset(38),
    cards: [
      { title: 'Dựng bộ sổ theo thông tư hiện hành', done: false },
      { title: 'Nối số liệu sang phân hệ Kho', done: false },
    ],
  },
];

async function seedProjectPhases(page: Page): Promise<void> {
  const project = await getJson<{ customer_id: number | null; phases?: { name: string }[] }>(
    page,
    '/api/projects/1'
  );
  const have = new Set((project.phases ?? []).map((phase) => phase.name));

  for (const phase of PHASES) {
    if (have.has(phase.name)) continue;
    const board = await postJson<{ id: number }>(page, '/api/boards', {
      name: phase.name,
      project_id: 1,
      customer_id: project.customer_id,
    });
    const res = await page.request.patch(`/api/boards/${board.id}`, {
      data: { milestone_date: phase.milestone_date },
    });
    if (!res.ok()) throw new Error(`Dat moc cho bang ${board.id} that bai: ${res.status()}`);

    /* Bang moi tao da co san bo cot mac dinh (xem insertBoard) — tha the vao cot dau. */
    const full = await getJson<{ lists: { id: number }[] }>(page, `/api/boards/${board.id}/full`);
    const listId = full.lists[0]?.id;
    if (listId == null) throw new Error(`Bang ${board.id} khong co cot nao`);

    for (const card of phase.cards) {
      const created = await postJson<{ id: number }>(page, '/api/cards', {
        list_id: listId,
        title: card.title,
      });
      if (card.done) {
        const patched = await page.request.patch(`/api/cards/${created.id}`, {
          data: { is_done: true },
        });
        if (!patched.ok()) throw new Error(`Danh dau xong the ${created.id}: ${patched.status()}`);
      }
    }
  }
}

export const SHOTS: Shot[] = [
  { name: 'dang-nhap-man-hinh', route: '/', anonymous: true },

  /* Thanh ben cao hon 800px nen phai noi khung nhin ra, khong thi muc cuoi
     (Huong dan) bi cat mat. */
  {
    name: 'giao-dien-thanh-ben',
    route: '/',
    clip: 'aside nav',
    type: 'png',
    viewport: { width: 1280, height: 1150 },
  },
  { name: 'giao-dien-thanh-tren', route: '/', clip: 'header.tr-topbar', type: 'png' },

  { name: 'tong-quan', route: '/' },
  { name: 'bang-tin', route: '/feed' },
  { name: 'cong-viec-cay', route: '/tasks' },
  { name: 'nhac-nguoi-khac', route: '/follow-up' },
  { name: 'lich', route: '/calendar' },
  { name: 'hieu-suat', route: '/performance' },
  { name: 'danh-ba-ca-nhan', route: '/my-contacts' },

  { name: 'bang-danh-sach', route: '/boards' },
  { name: 'bang-kanban', route: '/boards/1' },
  {
    name: 'the-cua-so',
    route: '/boards/1',
    prepare: async (page) => {
      await page.locator('.tr-card-shadow').first().click();
      await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 30_000 });
    },
  },
  {
    name: 'bang-bo-loc',
    route: '/boards/1',
    prepare: (page) => page.locator('button[title="Bộ lọc"]').first().click(),
  },
  {
    name: 'cot-menu',
    route: '/boards/1',
    prepare: (page) => page.locator('[aria-label^="Thao tác với cột"]').first().click(),
  },
  { name: 'dong-thoi-gian', route: '/timeline' },
  { name: 'du-an-danh-sach', route: '/projects' },

  /* Ba anh duoi day tu dung du lieu mau (xem phan tren) nen phai dung SAU
     `du-an-danh-sach` va `bang-danh-sach`: chung them bang va muc vao du an 1. */
  {
    name: 'giai-doan-moc-ban-giao',
    route: '/projects/1',
    prepare: async (page) => {
      await seedProjectPhases(page);
      await reload(page);
      await openTab(page, 'giai đoạn');
    },
  },
  {
    name: 'so-rui-ro-danh-sach',
    route: '/projects/1',
    prepare: async (page) => {
      await seedProjectRisks(page);
      await reload(page);
      await openTab(page, 'rủi ro');
    },
  },
  {
    name: 'ghi-chu-nhanh-bang',
    route: '/',
    prepare: async (page) => {
      await seedQuickNotes(page);
      await reload(page);
      await openQuickNotesBoard(page);
    },
  },
  /* Thanh cong cu ghi am chi hien day du o buoc "da ghi xong", nen phai ghi
     that mot doan ngan bang micro gia lap (xem launchOptions o config). */
  {
    name: 'ghi-am-cong-cu',
    route: '/',
    type: 'png',
    clip: `[role="dialog"][aria-label="${VOICE_NOTE_TITLE}"]`,
    /* Cua so ghi chu cao bang khung nhin tru 48px (xem createQuickNoteWindow),
       nen khung nhin thap lai de anh khong thua mot vung trong lon duoi hang nut. */
    viewport: { width: 900, height: 470 },
    prepare: async (page) => {
      await seedQuickNotes(page);
      await reload(page);
      const note = await openQuickNoteEditor(page);
      await note.getByRole('button', { name: 'Ghi âm' }).click();
      await page.waitForTimeout(2500);
      await note.getByRole('button', { name: 'Kết thúc' }).click();
      await note
        .getByRole('button', { name: 'Chuyển văn bản' })
        .waitFor({ state: 'visible', timeout: 30_000 });
    },
  },

  { name: 'khach-hang-danh-sach', route: '/customers' },
  { name: 'khach-hang-ho-so', route: '/customers/1' },
  /* Hop thoai chia se mo tu mot bao gia co san trong du lieu mau. Bam luon
     "Tao lien ket" de anh co ca duong dan vua tao — do moi la thu nguoi doc
     dang tim. Duong dan chi song trong CSDL tam cua lan chup. */
  {
    name: 'chia-se-link-hop-thoai',
    route: '/customers/1',
    prepare: async (page) => {
      await openTab(page, 'báo giá');
      await page
        .getByRole('button', { name: /^Chia sẻ: Báo giá/ })
        .first()
        .click();
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor({ state: 'visible', timeout: 30_000 });
      await dialog.getByRole('button', { name: 'Tạo liên kết' }).click();
      await dialog
        .getByRole('region', { name: 'Liên kết vừa tạo' })
        .waitFor({ state: 'visible', timeout: 30_000 });
    },
  },
  {
    name: 'lich-su-tuong-tac',
    route: '/customers/1',
    prepare: (page) => openTab(page, 'tương tác'),
  },
  { name: 'co-hoi-pipeline', route: '/pipeline' },
  { name: 'co-hoi-chi-tiet', route: '/deals/1' },
  { name: 'danh-gia-tab', route: '/deals/1', prepare: (page) => openTab(page, 'đánh giá') },
  { name: 'suc-khoe-pipeline', route: '/pipeline-health' },
  { name: 'hop-dong-danh-sach', route: '/contracts' },
  { name: 'doanh-thu-bang', route: '/revenue' },

  { name: 'tai-lieu-tep', route: '/documents?tab=files' },
  { name: 'ghi-chu-hop-danh-sach', route: '/documents?tab=pages' },
  { name: 'tro-ly-ai', route: '/ai' },
  { name: 'bao-cao', route: '/reports' },

  { name: 'cai-dat-nguoi-dung', route: '/settings?tab=users' },
  { name: 'cai-dat-so-do-to-chuc', route: '/settings?tab=org' },
  { name: 'cai-dat-vi-tri-quyen', route: '/settings?tab=positions' },
  { name: 'cai-dat-danh-muc', route: '/settings?tab=picklists' },
  { name: 'cai-dat-quy-trinh-ban-hang', route: '/settings?tab=pipeline' },
  { name: 'cai-dat-trang-thai-viec', route: '/settings?tab=taskStatuses' },
  { name: 'cai-dat-ban-giao', route: '/settings?tab=handover' },
  { name: 'cai-dat-trien-khai', route: '/settings?tab=delivery' },
  /* Phai dung SAU `chia-se-link-hop-thoai`: man nay liet ke chinh lien ket do. */
  { name: 'cai-dat-lien-ket-chia-se', route: '/settings?tab=shares' },
  { name: 'cai-dat-email', route: '/settings?tab=email' },
  { name: 'cai-dat-telegram', route: '/settings?tab=telegram' },
  { name: 'cai-dat-sao-luu', route: '/settings?tab=backup' },
  { name: 'cai-dat-xuat-du-lieu', route: '/settings?tab=export' },
  { name: 'cai-dat-ho-so-cau-hinh', route: '/settings?tab=profile' },
];
