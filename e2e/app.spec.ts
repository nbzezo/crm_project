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

function localDateTime(offsetMinutes: number): string {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.beforeEach(async ({ page }) => {
  // E2E khong phu thuoc mang ngoai: font da co fallback he thong trong CSS.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tổng quan');
  expect(errors).toEqual([]);
});

test('chon va luu ba giao dien tuy bien', async ({ page }) => {
  const themes = [
    { label: 'Neo ấm', value: 'neo-tactile' },
    { label: 'Neat Slate', value: 'neat-slate' },
    { label: 'Kem ngọc', value: 'cream-teal' },
  ] as const;

  for (const theme of themes) {
    await page.getByRole('button', { name: /^Giao diện:/ }).click();
    const picker = page.getByRole('dialog', { name: 'Giao diện' });
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: new RegExp(`^${theme.label}`) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.value);
    await expect(page.getByRole('button', { name: `Giao diện: ${theme.label}` })).toBeVisible();
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
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream-teal');
  await expect(page.getByRole('button', { name: 'Giao diện: Kem ngọc' })).toBeVisible();
});

test('notification center xu ly, hoan tac va mo dung ngu canh lich', async ({
  page,
  request,
}, testInfo) => {
  const title = `E2E Nhắc lịch ${testInfo.project.name} ${Date.now()}`;
  const created = await request.post('/api/reminders', {
    data: {
      title,
      note: 'Nội dung kiểm thử notification center',
      due_at: localDateTime(60),
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.reload();

  const bell = page.getByRole('button', { name: /Thông báo —/ });
  await bell.click();
  const center = page.getByRole('dialog', { name: 'Trung tâm thông báo' });
  await expect(center).toBeVisible();
  await expect(center.getByRole('tab', { name: /Chưa đọc/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(center.getByText(title, { exact: true })).toBeVisible();

  await center.getByRole('button', { name: `Nhắc lại sau: ${title}` }).click();
  await expect(center.getByRole('button', { name: '30 phút' })).toBeVisible();
  await expect(center.getByRole('button', { name: 'Mai 09:00' })).toBeVisible();

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

  await center.getByRole('button', { name: `Hoàn thành: ${title}` }).click();
  await expect(page.getByText(`Đã hoàn thành “${title}”`)).toBeVisible();
  await expect(center.getByText(title, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hoàn tác' }).click();
  // Toast nam ngoai popover nen click Hoan tac dong popover theo dung quy tac
  // click-outside. Mo lai de kiem tra du lieu da duoc khoi phuc.
  await bell.click();
  await expect(center).toBeVisible();
  await expect(center.getByText(title, { exact: true })).toBeVisible();

  await center.getByRole('button', { name: new RegExp(`^${escapeRegex(title)}`) }).click();
  await expect(page).toHaveURL(/\/calendar\?cv=list&cd=/);
  await expect(page.getByRole('dialog', { name: title })).toBeVisible();
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

  await page.goto('/settings');
  const tabs = page.getByRole('tab');
  /*
   * Điều đang được bảo vệ là ĐIỀU HƯỚNG BÀN PHÍM của tablist, không phải số tab —
   * nên `End` bám theo tab cuối cùng thay vì một chỉ số cứng. Đếm cứng khiến mỗi
   * lần thêm một mục Cài đặt lại làm hỏng một bài test không liên quan gì.
   */
  /* `count()` đọc một lần, không tự thử lại như `toHaveCount` — gọi thẳng sẽ đếm
     phải trang chưa render xong của route lazy và luôn ra 0. */
  await expect(tabs.first()).toBeVisible();
  const tabCount = await tabs.count();
  expect(tabCount).toBeGreaterThanOrEqual(4);

  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('End');
  await expect(tabs.nth(tabCount - 1)).toBeFocused();
  await expect(tabs.nth(tabCount - 1)).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'settingstab-labels');
});

test('tro ly AI viet lai noi dung tho va chuyen day du sang form tao cong viec', async ({
  page,
}) => {
  const roughTask =
    'Thứ sáu gọi lại khách hàng thử nghiệm về báo giá, ưu tiên cao, chuẩn bị câu hỏi KYC';
  let assistPayload: Record<string, unknown> | undefined;

  // Khong goi model ngoai trong E2E; response gia lap bao ve hop dong UI -> form chung.
  await page.route('**/api/ai/assist/task', async (route) => {
    assistPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Gọi lại khách hàng về báo giá KYC',
        description: 'Trao đổi các điểm còn vướng trong báo giá và xác nhận yêu cầu KYC.',
        priority: 'high',
        start_date: '2026-08-19',
        due_date: '2026-08-21',
        checklist: ['Chuẩn bị câu hỏi KYC', 'Xác nhận bước tiếp theo'],
        links: {
          customer_id: null,
          contact_id: null,
          deal_id: null,
          contract_id: null,
          quotation_id: null,
        },
        confidence: 0.93,
        rationale: 'Đã tách thời hạn, ưu tiên và các bước chuẩn bị.',
        warnings: [],
        meta: { requestId: 'e2e-ai-task', provider: 'deepseek', model: 'mock-model' },
      }),
    });
  });

  await page.goto('/ai');
  await page.getByLabel('Dán hoặc gõ nhanh nội dung task').fill(roughTask);
  await page.getByRole('button', { name: 'Viết lại thành task' }).click();

  await expect(page.getByText('AI đã viết lại')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Gọi lại khách hàng về báo giá KYC' })
  ).toBeVisible();
  await expect(page.getByText('Chuẩn bị câu hỏi KYC', { exact: true })).toBeVisible();
  expect(assistPayload).toMatchObject({ draft: roughTask, mode: 'balanced' });

  await page.getByRole('button', { name: 'Kiểm tra & tạo công việc' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tạo công việc' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Tiêu đề')).toHaveValue('Gọi lại khách hàng về báo giá KYC');
  await expect(dialog.getByLabel('Mô tả')).toHaveValue(
    'Trao đổi các điểm còn vướng trong báo giá và xác nhận yêu cầu KYC.'
  );
  await expect(dialog.getByLabel('Mức độ ưu tiên')).toHaveValue('high');
  await expect(dialog.getByLabel('Ngày bắt đầu')).toHaveValue('2026-08-19');
  await expect(dialog.getByLabel('Hạn hoàn thành')).toHaveValue('2026-08-21');
  await expect(dialog.getByLabel('Việc cần làm')).toHaveValue(
    'Chuẩn bị câu hỏi KYC\nXác nhận bước tiếp theo'
  );
  await expect(dialog.getByText(/AI đã điền:/)).toContainText('checklist');
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

test('giao viec cho nguoi cua to chuc khac roi loc theo nguoi phu trach', async ({
  page,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name;

  // To chuc noi bo + nhan su cua chinh minh — thu khong ton tai truoc v15.
  const orgResponse = await request.post('/api/customers', {
    data: { name: `E2E Noi bo ${suffix}`, org_kind: 'own' },
  });
  expect(orgResponse.ok()).toBeTruthy();
  const org = (await orgResponse.json()) as { id: number };
  const staffResponse = await request.post(`/api/customers/${org.id}/contacts`, {
    data: { full_name: `E2E Nhan su ${suffix}` },
  });
  expect(staffResponse.ok()).toBeTruthy();
  const staff = (await staffResponse.json()) as { id: number };

  // Khach hang rieng biet: viec VE khach hang nay nhung DO nhan su noi bo lam.
  const customerResponse = await request.post('/api/customers', {
    data: { name: `E2E Khach giao viec ${suffix}` },
  });
  expect(customerResponse.ok()).toBeTruthy();
  const customer = (await customerResponse.json()) as { id: number };
  const boardResponse = await request.post('/api/boards', {
    data: { name: `E2E Bang giao viec ${suffix}` },
  });
  expect(boardResponse.ok()).toBeTruthy();
  const board = (await boardResponse.json()) as { id: number };
  const listResponse = await request.post('/api/lists', {
    data: { board_id: board.id, name: 'Cần làm' },
  });
  expect(listResponse.ok()).toBeTruthy();
  const list = (await listResponse.json()) as { id: number };

  const cardTitle = `E2E Viec da giao ${suffix}`;
  const cardResponse = await request.post('/api/cards', {
    data: {
      list_id: list.id,
      title: cardTitle,
      customer_id: customer.id,
      assignee_contact_id: staff.id,
    },
  });
  expect(cardResponse.ok(), 'giao viec lien to chuc phai duoc chap nhan').toBeTruthy();

  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Công việc');
  await expect(page.getByRole('button', { name: 'Thêm công việc' })).toBeVisible();
  const taskRow = page.getByRole('button', { name: cardTitle, exact: true });
  await expect(taskRow).toBeVisible();

  // Loc theo dung nguoi do — viec phai con lai.
  await page.getByRole('button', { name: 'Bộ lọc nâng cao' }).click();
  await page
    .getByRole('combobox', { name: 'Người phụ trách' })
    .first()
    .selectOption(String(staff.id));
  await expect(taskRow).toBeVisible();

  // Loc "Chua giao" — viec da co nguoi nen phai bien mat.
  await page.getByRole('combobox', { name: 'Người phụ trách' }).first().selectOption('none');
  await expect(taskRow).toHaveCount(0);

  /* Man "Theo doi tien do": viec qua han cua nguoi do phai hien ra, va ghi mot lan nhac
     phai lam bo dem tren the tang len. */
  const overdueTitle = `E2E Viec qua han ${suffix}`;
  const overdue = await request.post('/api/cards', {
    data: {
      list_id: list.id,
      title: overdueTitle,
      due_date: localDate(-2),
      assignee_contact_id: staff.id,
    },
  });
  expect(overdue.ok()).toBeTruthy();
  const overdueCard = (await overdue.json()) as { id: number };

  await page.goto('/follow-up');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Theo dõi tiến độ');
  await expect(page.getByText(overdueTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(`trễ 2 ngày`).first()).toBeVisible();

  const nudge = await request.post('/api/nudges', {
    data: { card_id: overdueCard.id, channel: 'zalo', message: 'Nhắc tiến độ' },
  });
  expect(nudge.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText(/đã nhắc 1/).first()).toBeVisible();
});

test('du an gom bang va cong viec, suc khoe hien tren danh sach', async ({
  page,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const projectName = `E2E Du an ${suffix}`;

  const project = await request.post('/api/projects', {
    data: {
      name: projectName,
      code: 'E2E-01',
      plan_start: localDate(0),
      plan_end: localDate(30),
      status: 'active',
    },
  });
  expect(project.ok()).toBeTruthy();
  const projectId = ((await project.json()) as { id: number }).id;

  const targetProjectName = `E2E Du an dich ${suffix}`;
  const targetProject = await request.post('/api/projects', {
    data: { name: targetProjectName, status: 'active' },
  });
  expect(targetProject.ok()).toBeTruthy();
  const targetProjectId = ((await targetProject.json()) as { id: number }).id;
  const targetBoard = await request.post('/api/boards', {
    data: { name: `E2E Bang dich ${suffix}`, project_id: targetProjectId },
  });
  expect(targetBoard.ok()).toBeTruthy();

  const org = await request.post('/api/customers', {
    data: { name: `E2E To chuc du an ${suffix}`, org_kind: 'own' },
  });
  expect(org.ok()).toBeTruthy();
  const orgId = ((await org.json()) as { id: number }).id;
  const assigneeName = `E2E Phu trach du an ${suffix}`;
  const assignee = await request.post(`/api/customers/${orgId}/contacts`, {
    data: { full_name: assigneeName },
  });
  expect(assignee.ok()).toBeTruthy();

  const board = await request.post('/api/boards', {
    data: { name: `E2E Bang du an ${suffix}`, project_id: projectId },
  });
  expect(board.ok()).toBeTruthy();
  const boardId = ((await board.json()) as { id: number }).id;
  const full = await request.get(`/api/boards/${boardId}/full`);
  const listId = ((await full.json()) as { lists: { id: number }[] }).lists[0].id;

  // Có ngày thì mới lên được trục thời gian — Gantt chỉ vẽ việc đã xếp lịch.
  const taskTitle = `E2E Viec du an ${suffix}`;
  const task = await request.post('/api/cards', {
    data: {
      list_id: listId,
      title: taskTitle,
      start_date: localDate(1),
      due_date: localDate(5),
    },
  });
  expect(task.ok()).toBeTruthy();

  await page.goto('/projects');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dự án');
  const card = page.getByRole('link', { name: new RegExp(escapeRegex(projectName)) });
  await expect(card).toBeVisible();
  await expect(card.getByText('Đúng kế hoạch')).toBeVisible();

  await card.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(projectName);

  // Tab Công việc phải thấy việc tạo trong bảng của dự án (project_id suy ra từ bảng).
  await page.getByRole('tab', { name: 'Công việc' }).click();
  await expect(page.getByText(taskTitle).first()).toBeVisible();

  /* Sửa trực tiếp trong tab dự án phải làm mới chính query chi tiết dự án. Trước
     đây API đã lưu nhưng ô Người phụ trách vẫn hiện "Chưa giao" cho tới khi tải lại. */
  await page.getByRole('button', { name: 'Bảng', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Dạng xem' })
    .getByRole('button', { name: /Bảng tính/ })
    .click();
  const assigneePicker = page.getByRole('button', {
    name: `Người phụ trách: ${taskTitle}`,
  });
  await assigneePicker.click();
  await page
    .getByRole('dialog', { name: `Người phụ trách: ${taskTitle}` })
    .getByRole('button', { name: new RegExp(escapeRegex(assigneeName)) })
    .click();
  await expect(assigneePicker).toContainText(assigneeName);

  /* Chip Dự án trong drawer là một bộ chọn thật. Combobox này nằm trong một
     popover khác, nên ca này đồng thời chặn hồi quy popover cha đóng trước click. */
  await page.getByRole('button', { name: taskTitle, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: taskTitle });
  await drawer.getByRole('button', { name: `Dự án: ${projectName}` }).click();
  await page.getByRole('button', { name: 'Chọn dự án cho công việc' }).click();
  await page
    .getByRole('dialog', { name: 'Chọn dự án cho công việc' })
    .getByRole('button', { name: new RegExp(escapeRegex(targetProjectName)) })
    .click();
  await expect(drawer.getByRole('button', { name: `Dự án: ${targetProjectName}` })).toBeVisible();

  // Tra lai du an goc de phan con lai cua ca kiem thu tiep tuc tren cung ngu canh.
  await drawer.getByRole('button', { name: `Dự án: ${targetProjectName}` }).click();
  await page.getByRole('button', { name: 'Chọn dự án cho công việc' }).click();
  await page
    .getByRole('dialog', { name: 'Chọn dự án cho công việc' })
    .getByRole('button', { name: new RegExp(escapeRegex(projectName)) })
    .click();
  await expect(drawer.getByRole('button', { name: `Dự án: ${projectName}` })).toBeVisible();
  await drawer.getByRole('button', { name: 'Đóng', exact: true }).click();

  /* Một việc bị chặn kéo sức khỏe xuống đỏ ngay — chỉ số tính khi đọc, không có
     cột lưu nào để lệch. */
  const blocked = await request.post('/api/cards', {
    data: { list_id: listId, title: `E2E Viec bi chan ${suffix}` },
  });
  const blockedId = ((await blocked.json()) as { id: number }).id;
  await request.patch(`/api/cards/${blockedId}`, {
    data: { status: 'blocked', blocked_reason: 'Chờ cấp quyền' },
  });

  await page.goto('/projects');
  await expect(
    page.getByRole('link', { name: new RegExp(escapeRegex(projectName)) }).getByText('Có rủi ro')
  ).toBeVisible();

  /* Dự án có đủ dạng xem như một bảng (v19) — Gantt cấp dự án là thứ trước đó
     không có cách nào mở được. */
  await page.goto(`/projects/${projectId}?view=timeline`);
  await page.getByRole('tab', { name: 'Công việc' }).click();
  await expect(page.getByTestId('timeline-canvas')).toBeVisible();

  /* Kéo thẻ sang bảng của dự án khác thì việc rời khỏi dự án ngay — dự án suy từ
     bảng, không còn cột riêng trên thẻ để lệch. */
  const outsideBoard = await request.post('/api/boards', {
    data: { name: `E2E Bang ngoai ${suffix}` },
  });
  const outsideId = ((await outsideBoard.json()) as { id: number }).id;
  const outsideFull = await request.get(`/api/boards/${outsideId}/full`);
  const outsideList = ((await outsideFull.json()) as { lists: { id: number }[] }).lists[0].id;
  await request.patch(`/api/cards/${blockedId}/move`, { data: { list_id: outsideList } });

  const moved = await request.get(`/api/cards/${blockedId}`);
  expect(((await moved.json()) as { project_id: number | null }).project_id).toBeNull();
});

test('cot Kanban khai bao trang thai va dong bo hai chieu tren giao dien', async ({
  page,
  request,
}, testInfo) => {
  const suffix = testInfo.project.name;
  const board = await request.post('/api/boards', { data: { name: `E2E Bang anh xa ${suffix}` } });
  const boardId = ((await board.json()) as { id: number }).id;
  const full = await request.get(`/api/boards/${boardId}/full`);
  const lists = ((await full.json()) as { lists: { id: number; status_mapping: string | null }[] })
    .lists;

  // Bảng mới phải có sẵn ánh xạ — nếu không, cột và trạng thái lại trôi tự do.
  expect(lists.map((l) => l.status_mapping)).toEqual(['todo', 'doing', 'review', 'done']);

  const cardTitle = `E2E The anh xa ${suffix}`;
  const created = await request.post('/api/cards', {
    data: { list_id: lists[0].id, title: cardTitle },
  });
  const cardId = ((await created.json()) as { id: number }).id;

  await page.goto(`/boards/${boardId}`);
  // Cột mang nghĩa vòng đời thì nói ra ngay trên tiêu đề cột.
  await expect(page.getByText('Hoàn thành', { exact: true }).first()).toBeVisible();

  // Kéo thẻ sang cột "Hoàn thành" (qua API) rồi kiểm tra giao diện phản ánh đúng.
  await request.patch(`/api/cards/${cardId}/move`, { data: { list_id: lists[3].id } });
  const afterMove = (await (await request.get(`/api/cards/${cardId}`)).json()) as {
    status: string;
    is_done: number;
  };
  expect(afterMove.status).toBe('done');
  expect(afterMove.is_done).toBe(1);

  // Chiều ngược lại: đổi trạng thái thì thẻ tự nhảy về đúng cột.
  await request.patch(`/api/cards/${cardId}`, { data: { status: 'doing' } });
  const afterStatus = (await (await request.get(`/api/cards/${cardId}`)).json()) as {
    list_id: number;
    status: string;
  };
  expect(afterStatus.list_id).toBe(lists[1].id);
  expect(afterStatus.status).toBe('doing');

  await page.reload();
  await expect(page.getByText(cardTitle, { exact: true })).toBeVisible();
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
