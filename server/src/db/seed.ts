import { db } from './connection.ts';
import { buildSearchText } from '../lib/viSearch.ts';

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function timeOffset(days: number, hour = 9, minute = 0): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dayOffset(days)}T${p(hour)}:${p(minute)}`;
}

const existing = db.prepare(`SELECT COUNT(*) AS n FROM boards`).get() as { n: number };
if (existing.n > 0) {
  console.log('[seed] Co so du lieu da co du lieu — bo qua de tranh trung lap.');
  process.exit(0);
}

db.transaction(() => {
  /* ---- Nhan (v9: nhan cap 2 nam trong mot nhom) ---- */
  const labelIds: number[] = [];
  const insertLabel = db.prepare(
    `INSERT INTO labels (name, color, parent_id, name_norm, position) VALUES (?, ?, ?, ?, ?)`
  );
  const groupId = Number(
    db
      .prepare(`INSERT INTO labels (name, color, name_norm, position) VALUES (?, ?, ?, ?)`)
      .run('Loại công việc', '#8993a4', 'loai cong viec', 1).lastInsertRowid
  );
  for (const [name, color, norm] of [
    ['Khẩn', '#eb5a46', 'khan'],
    ['Chờ khách', '#f2d600', 'cho khach'],
    ['Nội bộ', '#0079bf', 'noi bo'],
    ['Bán hàng', '#61bd4f', 'ban hang'],
  ] as [string, string, string][]) {
    labelIds.push(
      Number(insertLabel.run(name, color, groupId, norm, labelIds.length + 1).lastInsertRowid)
    );
  }

  /* ---- Khach hang ---- */
  const insertCustomer = db.prepare(
    `INSERT INTO customers (name, short_name, tax_code, industry, address, website, phone, email,
                            size, source, status, notes, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const customers = [
    {
      name: 'Công ty TNHH Vĩnh Phát',
      short_name: 'Vĩnh Phát',
      size: 'Mid-market',
      source: 'Giới thiệu',
      status: 'customer',
      tax_code: '0312345678',
      industry: 'Sản xuất bao bì',
      address: 'KCN Tân Bình, TP. Hồ Chí Minh',
      website: 'vinhphat.com.vn',
      phone: '028 3812 4455',
      email: 'info@vinhphat.com.vn',
      notes: 'Khách hàng lâu năm, thanh toán đúng hạn. Ưu tiên trao đổi qua Zalo.',
    },
    {
      name: 'Công ty CP Thương mại Đại Nam',
      short_name: 'Đại Nam',
      size: 'Enterprise',
      source: 'Sự kiện / Hội chợ',
      status: 'customer',
      tax_code: '0109876543',
      industry: 'Phân phối thiết bị',
      address: '145 Nguyễn Trãi, Thanh Xuân, Hà Nội',
      website: 'dainam.vn',
      phone: '024 3556 7788',
      email: 'sales@dainam.vn',
      notes: 'Đang mở rộng chi nhánh miền Trung, nhu cầu phần mềm quản lý kho.',
    },
    {
      name: 'Công ty XNK Hoàng Gia',
      short_name: 'Hoàng Gia',
      size: 'SME',
      source: 'Sự kiện / Hội chợ',
      status: 'prospect',
      tax_code: '0401122334',
      industry: 'Xuất nhập khẩu nông sản',
      address: '22 Bạch Đằng, Hải Châu, Đà Nẵng',
      website: 'hoanggia-export.vn',
      phone: '0236 3899 001',
      email: 'contact@hoanggia-export.vn',
      notes: 'Quyết định mua tập trung ở giám đốc. Chu kỳ chốt dài.',
    },
  ];
  const customerIds = customers.map((c) =>
    Number(
      insertCustomer.run(
        c.name,
        c.short_name,
        c.tax_code,
        c.industry,
        c.address,
        c.website,
        c.phone,
        c.email,
        c.size,
        c.source,
        c.status,
        c.notes,
        buildSearchText(c.name, c.short_name, c.industry, c.notes, c.phone, c.email, c.tax_code)
      ).lastInsertRowid
    )
  );

  /* ---- Nguoi lien he ---- */
  const insertContact = db.prepare(
    `INSERT INTO contacts (customer_id, full_name, title, department, phone, email, zalo,
                           buying_role, relationship, is_primary, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const contactIds = [
    Number(
      insertContact.run(
        customerIds[0],
        'Nguyễn Văn Thành',
        'Giám đốc mua hàng',
        'Mua hàng',
        '0903 111 222',
        'thanh.nv@vinhphat.com.vn',
        '0903111222',
        'decision_maker',
        'good',
        1,
        ''
      ).lastInsertRowid
    ),
    Number(
      insertContact.run(
        customerIds[0],
        'Trần Thị Mai',
        'Kế toán trưởng',
        'Tài chính',
        '0908 333 444',
        'mai.tt@vinhphat.com.vn',
        null,
        'finance',
        'normal',
        0,
        ''
      ).lastInsertRowid
    ),
    Number(
      insertContact.run(
        customerIds[1],
        'Lê Quốc Hùng',
        'Trưởng phòng CNTT',
        'Công nghệ thông tin',
        '0912 555 666',
        'hung.lq@dainam.vn',
        '0912555666',
        'technical',
        'excellent',
        1,
        'Người ra quyết định kỹ thuật.'
      ).lastInsertRowid
    ),
    Number(
      insertContact.run(
        customerIds[2],
        'Phạm Hoàng Long',
        'Tổng giám đốc',
        'Ban giám đốc',
        '0913 777 888',
        'long.ph@hoanggia-export.vn',
        '0913777888',
        'economic_buyer',
        'new',
        1,
        ''
      ).lastInsertRowid
    ),
  ];

  /* ---- Co hoi ban hang ---- */
  const insertDeal = db.prepare(
    `INSERT INTO deals (customer_id, contact_id, title, product, stage, probability, value_vnd,
                        won_value_vnd, position, expected_close_date, closed_at, source, need,
                        competitor, next_action, next_action_date, notes, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  type DealSeed = {
    customer: number;
    contact: number | null;
    title: string;
    product: string;
    stage: string;
    probability: number;
    value: number;
    won?: number | null;
    expected: string | null;
    closed?: string | null;
    source: string;
    need?: string;
    competitor?: string;
    nextAction?: string;
    nextActionDate?: string | null;
    notes: string;
  };
  const deals: DealSeed[] = [
    {
      customer: customerIds[0],
      contact: contactIds[0],
      title: 'Gói phần mềm quản lý sản xuất',
      product: 'Phần mềm MES',
      stage: 'quoted',
      probability: 60,
      value: 180_000_000,
      expected: dayOffset(21),
      source: 'Giới thiệu',
      need: 'Theo dõi sản lượng 3 dây chuyền theo thời gian thực.',
      competitor: 'FPT IS',
      nextAction: 'Gọi khách hàng',
      nextActionDate: dayOffset(2),
      notes: 'Đã gửi báo giá đầu tháng, chờ phản hồi.',
    },
    {
      customer: customerIds[0],
      contact: contactIds[0],
      title: 'Nâng cấp hệ thống năm 2025',
      product: 'Dịch vụ nâng cấp',
      stage: 'won',
      probability: 100,
      value: 95_000_000,
      won: 95_000_000,
      expected: dayOffset(-95),
      closed: dayOffset(-95),
      source: 'Giới thiệu',
      notes: '',
    },
    {
      customer: customerIds[1],
      contact: contactIds[2],
      title: 'Triển khai phần mềm quản lý kho',
      product: 'Phần mềm WMS',
      stage: 'negotiating',
      probability: 80,
      value: 260_000_000,
      expected: dayOffset(45),
      source: 'Sự kiện / Hội chợ',
      need: 'Quản lý kho 2 chi nhánh, tích hợp máy quét mã.',
      nextAction: 'Hẹn meeting',
      nextActionDate: dayOffset(-1),
      notes: 'Đang khảo sát quy trình kho tại 2 chi nhánh.',
    },
    {
      customer: customerIds[1],
      contact: contactIds[2],
      title: 'Dịch vụ bảo trì 12 tháng',
      product: 'Bảo trì',
      stage: 'won',
      probability: 100,
      value: 48_000_000,
      won: 48_000_000,
      expected: dayOffset(-40),
      closed: dayOffset(-40),
      source: 'Giới thiệu',
      notes: '',
    },
    {
      customer: customerIds[2],
      contact: contactIds[3],
      title: 'Hệ thống truy xuất nguồn gốc',
      product: 'Tem QR truy xuất',
      stage: 'approaching',
      probability: 20,
      value: 320_000_000,
      expected: dayOffset(90),
      source: 'Sự kiện / Hội chợ',
      need: 'Tem QR cho lô hàng nông sản xuất khẩu EU.',
      notes: 'Mới tiếp cận qua hội chợ nông sản.',
    },
    {
      customer: customerIds[2],
      contact: contactIds[3],
      title: 'Gói tư vấn quy trình xuất khẩu',
      product: 'Tư vấn',
      stage: 'lost',
      probability: 0,
      value: 60_000_000,
      expected: dayOffset(-20),
      closed: dayOffset(-20),
      source: 'Website',
      competitor: 'Đơn vị tư vấn nội địa',
      notes: '',
    },
  ];
  const dealIds = deals.map((d, i) =>
    Number(
      insertDeal.run(
        d.customer,
        d.contact,
        d.title,
        d.product,
        d.stage,
        d.probability,
        d.value,
        d.won ?? null,
        (i + 1) * 1024,
        d.expected,
        d.closed ?? null,
        d.source,
        d.need ?? null,
        d.competitor ?? null,
        d.nextAction ?? null,
        d.nextActionDate ?? null,
        d.notes,
        buildSearchText(d.title, d.product, d.need, d.notes)
      ).lastInsertRowid
    )
  );
  db.prepare(`UPDATE deals SET lost_reason = ?, lost_note = ? WHERE id = ?`).run(
    'competitor',
    'Khách chọn đối thủ có giá thấp hơn khoảng 15%.',
    dealIds[5]
  );

  /* ---- Tuong tac ---- */
  const insertInteraction = db.prepare(
    `INSERT INTO interactions (customer_id, contact_id, deal_id, type, occurred_at, summary, result)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  insertInteraction.run(
    customerIds[0],
    contactIds[0],
    dealIds[0],
    'zalo',
    timeOffset(-2, 9, 30),
    'Anh Thành xác nhận đã nhận báo giá, sẽ họp nội bộ tuần sau.',
    'Chờ phản hồi trong tuần'
  );
  insertInteraction.run(
    customerIds[0],
    contactIds[0],
    dealIds[0],
    'meeting',
    timeOffset(-9, 14, 0),
    'Khảo sát nhà máy, ghi nhận 3 dây chuyền cần theo dõi sản lượng.',
    'Thống nhất phạm vi triển khai'
  );
  insertInteraction.run(
    customerIds[1],
    contactIds[2],
    dealIds[2],
    'call',
    timeOffset(-4, 10, 15),
    'Anh Hùng đề nghị demo phân hệ kho trước khi trình ban giám đốc.',
    'Cần chuẩn bị demo'
  );
  insertInteraction.run(
    customerIds[1],
    contactIds[2],
    null,
    'email',
    timeOffset(-30, 8, 0),
    'Gửi tài liệu giới thiệu năng lực và danh sách khách hàng tham chiếu.',
    null
  );
  insertInteraction.run(
    customerIds[2],
    contactIds[3],
    dealIds[4],
    'meeting',
    timeOffset(-12, 15, 30),
    'Gặp tại hội chợ, anh Long quan tâm tem truy xuất QR cho lô hàng xuất khẩu.',
    'Hẹn gửi đề xuất'
  );
  insertInteraction.run(
    customerIds[2],
    contactIds[3],
    dealIds[5],
    'call',
    timeOffset(-20, 16, 0),
    'Khách thông báo chọn đơn vị khác cho gói tư vấn.',
    'Thua vì giá'
  );

  /* ---- Bang cong viec ---- */
  const insertBoard = db.prepare(`INSERT INTO boards (name, color, customer_id) VALUES (?, ?, ?)`);
  const insertList = db.prepare(`INSERT INTO lists (board_id, name, position) VALUES (?, ?, ?)`);
  const insertCard = db.prepare(
    `INSERT INTO cards (list_id, title, description, position, start_date, due_date, priority, customer_id, deal_id, is_done, completed_at, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const makeBoard = (name: string, color: string, customerId: number | null) => {
    const boardId = Number(insertBoard.run(name, color, customerId).lastInsertRowid);
    const listIds = ['Cần làm', 'Đang làm', 'Chờ duyệt', 'Hoàn thành'].map((listName, i) =>
      Number(insertList.run(boardId, listName, (i + 1) * 1024).lastInsertRowid)
    );
    return { boardId, listIds };
  };

  const project = makeBoard('Dự án phần mềm Vĩnh Phát', '#0079bf', customerIds[0]);
  const sales = makeBoard('Hoạt động bán hàng', '#519839', null);
  const personal = makeBoard('Việc cá nhân', '#89609e', null);

  type CardSeed = {
    listId: number;
    title: string;
    description?: string;
    start?: string | null;
    due?: string | null;
    priority: string;
    customerId?: number | null;
    dealId?: number | null;
    done?: boolean;
    completedDays?: number;
  };

  const cardSeeds: CardSeed[] = [
    {
      listId: project.listIds[0],
      title: 'Chuẩn bị tài liệu phân tích nghiệp vụ',
      description: 'Tổng hợp quy trình 3 dây chuyền đã khảo sát.',
      start: dayOffset(1),
      due: dayOffset(8),
      priority: 'high',
      customerId: customerIds[0],
      dealId: dealIds[0],
    },
    {
      listId: project.listIds[0],
      title: 'Lên kế hoạch triển khai theo giai đoạn',
      start: dayOffset(6),
      due: dayOffset(20),
      priority: 'medium',
      customerId: customerIds[0],
    },
    {
      listId: project.listIds[1],
      title: 'Hoàn thiện báo giá chi tiết cho anh Thành',
      description: 'Tách rõ chi phí license và triển khai.',
      start: dayOffset(-3),
      due: dayOffset(-1),
      priority: 'urgent',
      customerId: customerIds[0],
      dealId: dealIds[0],
    },
    {
      listId: project.listIds[1],
      title: 'Dựng bản demo phân hệ theo dõi sản lượng',
      start: dayOffset(-2),
      due: dayOffset(9),
      priority: 'high',
      customerId: customerIds[0],
    },
    {
      listId: project.listIds[2],
      title: 'Rà soát hợp đồng nguyên tắc',
      due: dayOffset(4),
      priority: 'medium',
      customerId: customerIds[0],
    },
    {
      listId: project.listIds[3],
      title: 'Khảo sát hiện trạng nhà máy',
      start: dayOffset(-14),
      due: dayOffset(-9),
      priority: 'high',
      customerId: customerIds[0],
      done: true,
      completedDays: -9,
    },

    {
      listId: sales.listIds[0],
      title: 'Gọi lại anh Hùng về lịch demo phân hệ kho',
      due: dayOffset(2),
      priority: 'urgent',
      customerId: customerIds[1],
      dealId: dealIds[2],
    },
    {
      listId: sales.listIds[0],
      title: 'Soạn đề xuất hệ thống truy xuất nguồn gốc',
      start: dayOffset(3),
      due: dayOffset(17),
      priority: 'medium',
      customerId: customerIds[2],
      dealId: dealIds[4],
    },
    {
      listId: sales.listIds[1],
      title: 'Chuẩn bị bộ tài liệu năng lực bản 2026',
      start: dayOffset(-5),
      due: dayOffset(6),
      priority: 'low',
    },
    {
      listId: sales.listIds[2],
      title: 'Chốt điều khoản bảo trì với Đại Nam',
      due: dayOffset(-2),
      priority: 'high',
      customerId: customerIds[1],
    },
    {
      listId: sales.listIds[3],
      title: 'Gửi báo giá gói phần mềm sản xuất',
      start: dayOffset(-24),
      due: dayOffset(-18),
      priority: 'high',
      customerId: customerIds[0],
      dealId: dealIds[0],
      done: true,
      completedDays: -18,
    },
    {
      listId: sales.listIds[3],
      title: 'Tổng kết doanh số quý trước',
      due: dayOffset(-32),
      priority: 'medium',
      done: true,
      completedDays: -31,
    },

    {
      listId: personal.listIds[0],
      title: 'Đăng ký khóa học phân tích dữ liệu',
      due: dayOffset(25),
      priority: 'low',
    },
    {
      listId: personal.listIds[0],
      title: 'Tìm hiểu quy định hóa đơn điện tử mới',
      description: 'Chưa xác định thời điểm — để trong mục chưa xếp lịch.',
      priority: 'low',
    },
    {
      listId: personal.listIds[1],
      title: 'Sắp xếp lại hồ sơ hợp đồng năm nay',
      start: dayOffset(-1),
      due: dayOffset(12),
      priority: 'low',
    },
    {
      listId: personal.listIds[3],
      title: 'Gia hạn tên miền công ty',
      due: dayOffset(-45),
      priority: 'medium',
      done: true,
      completedDays: -44,
    },
  ];

  const cardIds: number[] = [];
  for (let i = 0; i < cardSeeds.length; i++) {
    const c = cardSeeds[i];
    const id = Number(
      insertCard.run(
        c.listId,
        c.title,
        c.description ?? '',
        (i + 1) * 1024,
        c.start ?? null,
        c.due ?? null,
        c.priority,
        c.customerId ?? null,
        c.dealId ?? null,
        c.done ? 1 : 0,
        c.done ? `${dayOffset(c.completedDays ?? 0)} 10:00:00` : null,
        buildSearchText(c.title, c.description)
      ).lastInsertRowid
    );
    cardIds.push(id);
  }

  /* ---- Viec con (mot cap) ---- */
  const insertSubtask = db.prepare(
    `INSERT INTO cards (list_id, parent_id, title, position, priority, due_date, customer_id, is_done, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const parentCardId = cardIds[0];
  const parentList = db
    .prepare(`SELECT list_id, customer_id FROM cards WHERE id = ?`)
    .get(parentCardId) as {
    list_id: number;
    customer_id: number | null;
  };
  [
    ['Phỏng vấn trưởng ca dây chuyền 1', 'high', dayOffset(2), 1],
    ['Phỏng vấn trưởng ca dây chuyền 2', 'high', dayOffset(4), 0],
    ['Vẽ sơ đồ luồng dữ liệu', 'medium', dayOffset(6), 0],
  ].forEach(([title, priority, due, done], i) =>
    insertSubtask.run(
      parentList.list_id,
      parentCardId,
      title as string,
      (i + 1) * 1024,
      priority as string,
      due as string,
      parentList.customer_id,
      done as number,
      buildSearchText(title as string)
    )
  );

  /* ---- Checklist + nhan cho vai the ---- */
  const insertChecklist = db.prepare(
    `INSERT INTO checklist_items (card_id, content, is_done, position) VALUES (?, ?, ?, ?)`
  );
  const checklist: [number, string, number][] = [
    [cardIds[2], 'Tổng hợp chi phí license', 1],
    [cardIds[2], 'Tính công triển khai', 1],
    [cardIds[2], 'Duyệt lại với kế toán', 0],
    [cardIds[0], 'Phỏng vấn trưởng ca dây chuyền 1', 1],
    [cardIds[0], 'Vẽ sơ đồ quy trình', 0],
    [cardIds[6], 'Xem lại ghi chú cuộc gọi trước', 0],
  ];
  checklist.forEach(([cardId, content, done], i) =>
    insertChecklist.run(cardId, content, done, (i + 1) * 1024)
  );

  const insertCardLabel = db.prepare(
    `INSERT OR IGNORE INTO card_labels (card_id, label_id) VALUES (?, ?)`
  );
  insertCardLabel.run(cardIds[2], labelIds[0]);
  insertCardLabel.run(cardIds[2], labelIds[3]);
  insertCardLabel.run(cardIds[4], labelIds[1]);
  insertCardLabel.run(cardIds[6], labelIds[3]);
  insertCardLabel.run(cardIds[8], labelIds[2]);

  /* ---- Nhac hen ---- */
  const insertReminder = db.prepare(
    `INSERT INTO reminders (title, note, due_at, card_id, customer_id, deal_id) VALUES (?, ?, ?, ?, ?, ?)`
  );
  insertReminder.run(
    'Gọi anh Hùng xác nhận lịch demo',
    '',
    timeOffset(-1, 9, 0),
    cardIds[6],
    null,
    null
  );
  insertReminder.run(
    'Follow-up báo giá Vĩnh Phát',
    'Nếu chưa phản hồi thì nhắn Zalo.',
    timeOffset(2, 14, 0),
    null,
    customerIds[0],
    dealIds[0]
  );
  insertReminder.run(
    'Chuẩn bị họp nội bộ về Hoàng Gia',
    '',
    timeOffset(5, 8, 30),
    null,
    customerIds[2],
    dealIds[4]
  );

  /* ---- Bao gia (FR-QUO) ---- */
  const insertQuotation = db.prepare(
    `INSERT INTO quotations (customer_id, deal_id, code, version, quote_date, value_vnd, valid_until, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertQuotation.run(
    customerIds[0],
    dealIds[0],
    'BG-2026-011',
    1,
    dayOffset(-24),
    195_000_000,
    dayOffset(-4),
    'revision',
    'Khách đề nghị bỏ bớt phân hệ báo cáo.'
  );
  insertQuotation.run(
    customerIds[0],
    dealIds[0],
    'BG-2026-014',
    2,
    dayOffset(-6),
    180_000_000,
    dayOffset(24),
    'sent',
    'Bản chỉnh sửa theo yêu cầu.'
  );
  insertQuotation.run(
    customerIds[1],
    dealIds[2],
    'BG-2026-016',
    1,
    dayOffset(-10),
    260_000_000,
    dayOffset(20),
    'reviewing',
    ''
  );

  /* ---- Hop dong (FR-CTR) ---- */
  const insertContract = db.prepare(
    `INSERT INTO contracts (customer_id, deal_id, name, number, value_vnd, sign_date, start_date,
                            end_date, status, payment_terms, notes, search_text)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const contractIds = [
    Number(
      insertContract.run(
        customerIds[0],
        dealIds[1],
        'Hợp đồng nâng cấp hệ thống 2025',
        'HD-2025-034',
        95_000_000,
        dayOffset(-95),
        dayOffset(-90),
        dayOffset(25),
        'active',
        '50% tạm ứng, 50% khi nghiệm thu',
        'Sắp hết hạn, cần chào gia hạn.',
        buildSearchText('Hợp đồng nâng cấp hệ thống 2025', 'HD-2025-034')
      ).lastInsertRowid
    ),
    Number(
      insertContract.run(
        customerIds[1],
        dealIds[3],
        'Hợp đồng bảo trì 12 tháng',
        'HD-2025-058',
        48_000_000,
        dayOffset(-40),
        dayOffset(-35),
        dayOffset(75),
        'active',
        'Thanh toán theo quý',
        '',
        buildSearchText('Hợp đồng bảo trì 12 tháng', 'HD-2025-058')
      ).lastInsertRowid
    ),
  ];
  void contractIds;

  console.log(
    '[seed] Da nap du lieu mau: 3 khach hang, 4 nguoi lien he, 6 co hoi, 3 bao gia, 2 hop dong, 3 bang, 16 the.'
  );
})();

process.exit(0);
