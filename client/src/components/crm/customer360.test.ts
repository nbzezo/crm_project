import { describe, expect, it } from 'vitest';
import { formatBirthday, parseBirthdayInput } from '../../lib/customerCare';
import type { CareStatus, Contact, CustomerOverviewData } from '../../types';
import { healthWithCadence } from './CustomerOverviewTab';
import { stakeholderWarnings } from './StakeholderMap';

function contact(patch: Partial<Contact> = {}): Contact {
  return {
    id: Math.floor(Math.random() * 1e6),
    customer_id: 1,
    full_name: 'A',
    title: null,
    department: null,
    phone: '0901',
    email: null,
    zalo: null,
    linkedin: null,
    buying_role: null,
    relationship: null,
    is_primary: 0,
    is_me: 0,
    is_active: 1,
    notes: '',
    ...patch,
  };
}

function overview(care: Partial<CareStatus>): CustomerOverviewData {
  const fullCare: CareStatus = {
    tier: 'standard',
    cadence_days: 30,
    cadence_source: 'tier',
    last_contact_at: '2026-09-01',
    next_contact_due: '2026-10-01',
    days_overdue: -5,
    state: 'ok',
    ...care,
  };
  return {
    care: fullCare,
    health: { level: 'good', label: 'Tốt', reason: 'Đang trong nhịp chăm sóc', care: fullCare },
  } as CustomerOverviewData;
}

describe('ngày sinh', () => {
  it('đọc dd/mm và dd/mm/yyyy theo cách gõ của người Việt', () => {
    expect(parseBirthdayInput('5/9')).toBe('09-05');
    expect(parseBirthdayInput('20/05/1985')).toBe('1985-05-20');
    expect(parseBirthdayInput('')).toBe('');
    expect(parseBirthdayInput('32/01')).toBeUndefined();
    expect(parseBirthdayInput('abc')).toBeUndefined();
  });
  it('hiển thị lại đúng dạng đã nhập', () => {
    expect(formatBirthday('09-05')).toBe('05/09');
    expect(formatBirthday('1985-05-20')).toBe('20/05/1985');
    expect(formatBirthday(null)).toBe('');
  });
});

describe('stakeholderWarnings', () => {
  it('cảnh báo thiếu người quyết định, người duyệt ngân sách và liên hệ chính khi có cơ hội mở', () => {
    const warnings = stakeholderWarnings(
      [contact({ buying_role: 'technical' })],
      [{ stage: 'lead' }]
    );
    expect(warnings).toEqual([
      'Chưa xác định người quyết định.',
      'Có cơ hội đang mở nhưng chưa rõ người duyệt ngân sách.',
      'Chưa đặt liên hệ chính.',
      'Chỉ có một đầu mối — rủi ro khi người này nghỉ hoặc đổi vị trí.',
    ]);
  });
  it('đủ vai trò thì không cảnh báo; người đã nghỉ không được tính', () => {
    const team = [
      contact({ buying_role: 'decision_maker', is_primary: 1 }),
      contact({ buying_role: 'economic_buyer' }),
    ];
    expect(stakeholderWarnings(team, [{ stage: 'quoted' }])).toEqual([]);
    expect(
      stakeholderWarnings([contact({ buying_role: 'decision_maker', is_active: 0 })], [])
    ).toEqual(['Chưa có người liên hệ nào.']);
  });
});

describe('healthWithCadence', () => {
  it('mọi màn hình ưu tiên kết quả chuẩn do backend trả về', () => {
    const data = overview({ tier: 'low', cadence_days: 90 });
    const legacy = { level: 'risk' as const, label: 'Rủi ro', reason: '40 ngày chưa tương tác' };
    expect(healthWithCadence(legacy, data)).toBe(data.health);
  });
});
