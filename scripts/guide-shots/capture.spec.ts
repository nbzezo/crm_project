import fs from 'node:fs';
import path from 'node:path';
import { test, type Page } from '@playwright/test';
import { IMG_DIR, SHOTS, type Shot } from './shots';

/*
 * Chup anh cho tai lieu huong dan. Khong phai kiem thu: khong khang dinh gi,
 * chi ghi file vao client/public/guide/img.
 *
 * Moi anh mot `test` de mot anh hong khong keo do ca lan chay — ket qua in ra
 * cho biet dung anh nao phai sua lai cach chup.
 */

fs.mkdirSync(IMG_DIR, { recursive: true });

/* Ep che do toi truoc khi trang chay: toan bo tai lieu dung mot tong mau. */
const forceDarkTheme = `try { localStorage.setItem('workflow-theme', 'dark'); } catch {}`;

/**
 * Cho trang lang di truoc khi chup.
 *
 * `dismissPopups` chi bat TRUOC `prepare`: popup nhac viec den han co the che
 * man hinh vua mo, nen phai bam Escape dong no. Nhung sau `prepare` thi Escape
 * dong luon hop thoai ma `prepare` vua mo ra de chup — bang bo loc, menu cot,
 * the cua so deu bien mat theo cach do.
 */
async function settle(page: Page, dismissPopups = true): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  if (dismissPopups) await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(600);
}

async function capture(page: Page, shot: Shot): Promise<void> {
  if (shot.viewport) await page.setViewportSize(shot.viewport);
  await page.addInitScript(forceDarkTheme);
  await page.goto(shot.route, { waitUntil: 'domcontentloaded' });
  await settle(page);
  if (shot.prepare) {
    await shot.prepare(page);
    await settle(page, false);
  }

  const type = shot.type ?? 'jpeg';
  const file = path.join(IMG_DIR, `${shot.name}.${type === 'jpeg' ? 'jpg' : 'png'}`);
  const options = type === 'jpeg' ? { type, quality: 85 as const } : { type };

  if (shot.clip) {
    await page
      .locator(shot.clip)
      .first()
      .screenshot({ path: file, ...options });
  } else {
    await page.screenshot({ path: file, ...options });
  }
  console.log(
    `[guide-shots] ${path.basename(file)} — ${Math.round(fs.statSync(file).size / 1024)} KB`
  );
}

for (const shot of SHOTS.filter((item) => !item.anonymous)) {
  test(shot.name, async ({ page }) => {
    await capture(page, shot);
  });
}

/* Man hinh dang nhap can mot phien CHUA dang nhap. */
test.describe('chua dang nhap', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const shot of SHOTS.filter((item) => item.anonymous)) {
    test(shot.name, async ({ page }) => {
      await capture(page, shot);
    });
  }
});
