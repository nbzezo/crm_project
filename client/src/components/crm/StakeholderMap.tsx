import { AlertTriangle, Mail, Phone, Star, Users } from 'lucide-react';
import { t } from '../../i18n/vi';
import type { Contact, Deal } from '../../types';
import { Button, Panel } from '../common/ui';
import { RELATIONSHIP_BADGE_CLASS } from './ContactList';
import { isClosedStage } from '../../lib/crmConfig';

/** Thứ tự vai trò trong quyết định mua — người có quyền chốt lên trước. */
const ROLE_ORDER = [
  'decision_maker',
  'economic_buyer',
  'influencer',
  'technical',
  'procurement',
  'finance',
  'legal',
  'user',
  'other',
] as const;

/**
 * Cảnh báo về độ phủ các bên liên quan. Thuần (không gọi API) để kiểm thử được:
 * chỉ dựa trên người liên hệ đang hoạt động và cơ hội đang mở.
 */
export function stakeholderWarnings(contacts: Contact[], deals: Pick<Deal, 'stage'>[]): string[] {
  const active = contacts.filter((c) => c.is_active !== 0);
  const openDeals = deals.filter((d) => !isClosedStage(d.stage)).length;
  if (active.length === 0) return ['Chưa có người liên hệ nào.'];
  const warnings: string[] = [];
  const deciders = active.filter((c) => c.buying_role === 'decision_maker');
  if (deciders.length === 0) warnings.push('Chưa xác định người quyết định.');
  if (openDeals > 0 && !active.some((c) => c.buying_role === 'economic_buyer'))
    warnings.push('Có cơ hội đang mở nhưng chưa rõ người duyệt ngân sách.');
  if (!active.some((c) => c.is_primary)) warnings.push('Chưa đặt liên hệ chính.');
  if (deciders.some((c) => c.relationship === 'difficult'))
    warnings.push('Quan hệ với người quyết định đang không thuận lợi.');
  if (openDeals > 0 && active.length === 1)
    warnings.push('Chỉ có một đầu mối — rủi ro khi người này nghỉ hoặc đổi vị trí.');
  if (!active.some((c) => c.phone || c.email))
    warnings.push('Chưa có số điện thoại hay email của ai.');
  return warnings;
}

export function StakeholderMap({
  contacts,
  deals,
  onManage,
}: {
  contacts: Contact[];
  deals: Deal[];
  onManage: () => void;
}) {
  const active = contacts.filter((c) => c.is_active !== 0);
  const warnings = stakeholderWarnings(contacts, deals);
  const groups = [...ROLE_ORDER, ''].map((role) => ({
    role,
    label: role ? (t.buyingRole[role] ?? role) : 'Chưa rõ vai trò',
    people: active
      .filter(
        (c) => (c.buying_role ?? '') === role || (!role && !t.buyingRole[c.buying_role ?? ''])
      )
      .sort((a, b) => b.is_primary - a.is_primary || a.full_name.localeCompare(b.full_name, 'vi')),
  }));

  return (
    <Panel
      title={
        <span className="flex items-center gap-1.5">
          <Users size={16} aria-hidden="true" /> Các bên liên quan ({active.length})
        </span>
      }
      action={
        <Button size="sm" onClick={onManage}>
          Quản lý
        </Button>
      }
    >
      {warnings.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-control bg-tr-warning/10 p-2.5 text-xs text-tr-text">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <AlertTriangle
                size={13}
                className="mt-0.5 shrink-0 text-tr-warning"
                aria-hidden="true"
              />
              {w}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3">
        {groups
          .filter((g) => g.people.length > 0)
          .map((group) => (
            <div key={group.role || 'none'}>
              <h3 className="mb-1 text-xs font-semibold text-tr-subtle">{group.label}</h3>
              <ul className="space-y-1.5">
                {group.people.map((c) => (
                  <li key={c.id} className="rounded-control border border-tr-border p-2 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 truncate font-medium text-tr-text">
                        {c.full_name}
                      </span>
                      {!!c.is_primary && (
                        <Star
                          size={12}
                          className="shrink-0 text-tr-warning"
                          aria-label={t.contact.primary}
                        />
                      )}
                      {c.relationship && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${RELATIONSHIP_BADGE_CLASS[c.relationship] ?? 'bg-tr-hover text-tr-subtle'}`}
                        >
                          {t.relationship[c.relationship] ?? c.relationship}
                        </span>
                      )}
                    </div>
                    {(c.position_name ?? c.title) && (
                      <p className="truncate text-xs text-tr-muted">{c.position_name ?? c.title}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      {c.phone && (
                        <a
                          href={`tel:${c.phone}`}
                          className="inline-flex items-center gap-1 text-tr-subtle hover:text-tr-primary"
                        >
                          <Phone size={12} aria-hidden="true" /> {c.phone}
                        </a>
                      )}
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex min-w-0 items-center gap-1 break-all text-tr-subtle hover:text-tr-primary"
                        >
                          <Mail size={12} aria-hidden="true" /> {c.email}
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {active.length === 0 && (
          <p className="text-sm text-tr-muted">
            Thêm ở tab Người liên hệ hoặc đưa từ Danh bạ cá nhân.
          </p>
        )}
      </div>
    </Panel>
  );
}
