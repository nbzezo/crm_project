import { useSearchParams } from 'react-router';
import { PageShell } from '../components/common/PageShell';
import { MeetingNotesPanel } from '../components/crm/meetingNotes/MeetingNotesPanel';
import { t } from '../i18n/vi';

/**
 * Trang "Ghi chú" o muc Phan tich & cong cu — liet ke TAT CA ghi chu (moi Co
 * hoi, Du an, hoac doc lap) o mot noi, bo sung them ngoai tab "Ghi chú họp"
 * van con nguyen trong tung Co hoi/Du an (xem DealDetailPage/ProjectDetailPage
 * — khong dong nao o do bi doi).
 *
 * `?open=<id>` mo san mot ghi chu cu the — dung khi nut hanh dong noi
 * (QuickCreateFab.tsx) vua tao xong mot ghi chu va dieu huong toi day.
 */
export default function NotesPage() {
  const [searchParams] = useSearchParams();
  const openId = Number(searchParams.get('open')) || null;

  return (
    <PageShell width="content">
      <h1 className="text-2xl font-semibold tracking-tight text-tr-text">{t.nav.notes}</h1>
      <p className="max-w-3xl text-sm text-tr-subtle">
        Toàn bộ ghi chú của mọi Cơ hội và Dự án ở một nơi — kể cả ghi chú riêng chưa gắn vào đâu.
        Ghi chú theo từng Cơ hội/Dự án vẫn mở được như cũ ở tab "Ghi chú họp" trong trang chi tiết.
      </p>

      <MeetingNotesPanel links={{}} customerId={null} showContext initialSelectedId={openId} />
    </PageShell>
  );
}
