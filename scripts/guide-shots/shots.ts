import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

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

  { name: 'khach-hang-danh-sach', route: '/customers' },
  { name: 'khach-hang-ho-so', route: '/customers/1' },
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
  { name: 'cai-dat-email', route: '/settings?tab=email' },
  { name: 'cai-dat-telegram', route: '/settings?tab=telegram' },
  { name: 'cai-dat-sao-luu', route: '/settings?tab=backup' },
  { name: 'cai-dat-xuat-du-lieu', route: '/settings?tab=export' },
  { name: 'cai-dat-ho-so-cau-hinh', route: '/settings?tab=profile' },
];
