import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tổng quan');
  expect(errors).toEqual([]);
});

test('dieu huong lazy routes, heading va search keyboard/deep-link', async ({
  page,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const customerResponse = await request.post('/api/customers', {
    data: { name: `E2E Acme ${suffix}` },
  });
  expect(customerResponse.ok()).toBeTruthy();
  const customer = (await customerResponse.json()) as { id: number };
  const dealResponse = await request.post('/api/deals', {
    data: { customer_id: customer.id, title: `E2E Opportunity ${suffix}` },
  });
  expect(dealResponse.ok()).toBeTruthy();
  const deal = (await dealResponse.json()) as { id: number };

  await page.keyboard.press('Control+K');
  const searchDialog = page.getByRole('dialog');
  await expect(searchDialog).toBeVisible();
  const dealTitle = `E2E Opportunity ${suffix}`;
  await searchDialog.getByRole('textbox').fill(dealTitle);
  await expect(searchDialog.getByText(dealTitle, { exact: true })).toBeVisible();
  await searchDialog.getByText(dealTitle, { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/deals/${deal.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chi tiết cơ hội');

  await page.goto('/contracts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hợp đồng');
  await page.goto('/documents');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tài liệu');
});

test('dashboard va board khong tran ngang viewport', async ({ page, request }, testInfo) => {
  const boardResponse = await request.post('/api/boards', {
    data: { name: 'E2E Responsive Board' },
  });
  expect(boardResponse.ok()).toBeTruthy();
  const board = (await boardResponse.json()) as { id: number };

  for (const pathname of ['/', `/boards/${board.id}`]) {
    await page.goto(pathname);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${testInfo.project.name}: ${pathname} tran ngang`).toBeLessThanOrEqual(1);
  }
});

test('timeline full-width, filter, tooltip, group va responsive sidebar', async ({
  page,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const boardName = `E2E Timeline ${suffix}`;
  const boardResponse = await request.post('/api/boards', { data: { name: boardName } });
  expect(boardResponse.ok()).toBeTruthy();
  const board = (await boardResponse.json()) as { id: number };

  const boardFullResponse = await request.get(`/api/boards/${board.id}/full`);
  expect(boardFullResponse.ok()).toBeTruthy();
  const boardFull = (await boardFullResponse.json()) as { lists: { id: number; name: string }[] };
  const listId = boardFull.lists[0]?.id;
  const listName = boardFull.lists[0]?.name;
  expect(listId).toBeTruthy();
  expect(listName).toBeTruthy();

  const taskTitle = `Soạn đề xuất hệ thống ${suffix}`;
  const scheduledResponse = await request.post('/api/cards', {
    data: {
      list_id: listId,
      title: taskTitle,
      priority: 'high',
      start_date: localDate(-1),
      due_date: localDate(4),
    },
  });
  expect(scheduledResponse.ok()).toBeTruthy();
  const scheduled = (await scheduledResponse.json()) as { id: number };
  const checklistResponse = await request.post(`/api/cards/${scheduled.id}/checklist`, {
    data: { content: 'Kiểm tra tiến độ thật' },
  });
  expect(checklistResponse.ok()).toBeTruthy();

  const overdueTitle = `Mốc quá hạn ${suffix}`;
  const overdueResponse = await request.post('/api/cards', {
    data: {
      list_id: listId,
      title: overdueTitle,
      priority: 'urgent',
      start_date: localDate(-3),
      due_date: localDate(-3),
    },
  });
  expect(overdueResponse.ok()).toBeTruthy();

  const unscheduledTitle = `Việc chưa xếp lịch ${suffix}`;
  const unscheduledResponse = await request.post('/api/cards', {
    data: { list_id: listId, title: unscheduledTitle, priority: 'medium' },
  });
  expect(unscheduledResponse.ok()).toBeTruthy();

  await page.goto(`/boards/${board.id}?view=timeline`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const timeline = page.getByTestId('timeline-grid');
  const scroll = page.getByTestId('timeline-scroll');
  const canvas = page.getByTestId('timeline-canvas');
  await expect(timeline).toBeVisible();
  const scrollBox = await scroll.boundingBox();
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThanOrEqual((scrollBox?.width ?? 0) - 1);

  const labelColumn = page.getByTestId('timeline-label-column');
  const labelBefore = await labelColumn.boundingBox();
  const resizeHandle = page.getByRole('separator', { name: 'Thay đổi độ rộng cột công việc' });
  await resizeHandle.focus();
  await page.keyboard.press('ArrowRight');
  const labelAfter = await labelColumn.boundingBox();
  expect(labelAfter?.width ?? 0).toBeGreaterThan(labelBefore?.width ?? 0);

  const groupButton = page.getByRole('button', { name: new RegExp(escapeRegex(listName ?? '')) });
  await expect(page.getByTitle(taskTitle)).toBeVisible();
  await groupButton.click();
  await expect(page.getByTitle(taskTitle)).toBeHidden();
  await groupButton.click();
  await expect(page.getByTitle(taskTitle)).toBeVisible();

  const taskBar = page.getByRole('button', {
    name: new RegExp(`^${escapeRegex(taskTitle)}, .*ưu tiên`),
  });
  await taskBar.hover();
  const taskTooltip = page.getByRole('tooltip');
  await expect(taskTooltip).toContainText(taskTitle);
  await expect(taskTooltip).toContainText('Tiến độ');
  await expect(taskTooltip).toContainText('0%');

  const overdueBar = page.getByRole('button', {
    name: new RegExp(`^${escapeRegex(overdueTitle)}, mốc ngày`),
  });
  await overdueBar.hover();
  await expect(page.getByRole('tooltip')).toContainText(/Quá hạn \d+ ngày/);

  await expect(page.getByText('Hôm nay', { exact: true })).toHaveCount(2);
  const search = page.getByRole('searchbox', { name: 'Tìm công việc trên dòng thời gian' });
  await search.fill(taskTitle);
  await expect(page.getByText('1/2 công việc đã xếp lịch')).toBeVisible();
  await page.getByRole('button', { name: 'Đặt lại' }).click();
  await page.getByRole('combobox', { name: 'Lọc theo mức ưu tiên' }).selectOption('urgent');
  await expect(page.getByText('1/2 công việc đã xếp lịch')).toBeVisible();
  await page.getByRole('button', { name: 'Đặt lại' }).click();

  await expect(page.getByTitle(`Xếp lịch cho ${unscheduledTitle}`)).toBeVisible();

  if (testInfo.project.name === 'desktop-chromium') {
    const widthBefore = (await timeline.boundingBox())?.width ?? 0;
    await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
    await expect
      .poll(async () => (await timeline.boundingBox())?.width ?? 0)
      .toBeGreaterThan(widthBefore + 100);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `${testInfo.project.name}: timeline tran ngang trang`).toBeLessThanOrEqual(1);
});

test('WCAG AA scan, skip-link va reflow 200%', async ({ page, request }, testInfo) => {
  const boardResponse = await request.post('/api/boards', {
    data: { name: `E2E Accessibility ${testInfo.project.name}` },
  });
  expect(boardResponse.ok()).toBeTruthy();
  const board = (await boardResponse.json()) as { id: number };

  for (const pathname of ['/', `/boards/${board.id}`]) {
    await page.goto(pathname);
    await page.waitForLoadState('networkidle');
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      scan.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, html, failureSummary }) => ({ target, html, failureSummary })),
      }))
    ).toEqual([]);

    if (testInfo.project.name === 'mobile-chromium') {
      const touchTargets =
        pathname === '/'
          ? [page.getByRole('button', { name: /Tìm thẻ/ })]
          : await page.getByRole('button', { name: /Di chuyển danh sách/ }).all();
      expect(touchTargets.length).toBeGreaterThan(0);
      for (const target of touchTargets) {
        const box = await target.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
  }

  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Bỏ qua đến nội dung chính' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  const overflowAtZoom = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(
    overflowAtZoom,
    `${testInfo.project.name}: dashboard tran ngang o 200%`
  ).toBeLessThanOrEqual(1);
});
