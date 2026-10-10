import { useQuery } from '@tanstack/react-query';
import { feedApi, feedKeys, type LinkType } from '../../lib/feed';
import { Composer } from './Composer';
import { PostList } from './PostList';

/*
 * Trao doi noi bo cua mot khach hang / co hoi (1.35.0): moi bai Bang tin gan the
 * ban ghi nay, tu cac nhom nguoi xem doc duoc, cung o dang bai gan san the. Sales,
 * ky thuat, ke toan ban ve mot khach tai mot cho thay vi luc lai bang tin.
 *
 * Bai van thuoc mot NHOM (chon khi dang) — ai thay bai van theo nhom do; ban ghi
 * CRM gan vao bai van theo quyen cua chinh no.
 */
export function LinkedDiscussion({
  type,
  id,
  label,
  includeRelated = false,
}: {
  type: LinkType;
  id: number;
  label: string;
  /** Trang khach hang: gom ca bai gan co hoi / hop dong cua khach do. */
  includeRelated?: boolean;
}) {
  const nav = useQuery({ queryKey: feedKeys.nav, queryFn: feedApi.nav });
  return (
    <div className="space-y-4">
      <p className="text-sm text-tr-subtle">
        Trao đổi nội bộ về <b className="text-tr-text">{label}</b> trên Bảng tin
        {includeRelated ? ', gồm cả các cơ hội và hợp đồng của khách hàng này' : ''}. Bài đăng ở đây
        tự gắn thẻ {type === 'customer' ? 'khách hàng' : 'cơ hội'} và hiện trong nhóm bạn chọn.
      </p>
      <Composer
        groups={nav.data?.groups ?? []}
        initialLinks={[{ type, id, label, sub: '' }]}
        collapsedLabel={`Trao đổi về ${label}…`}
      />
      <PostList
        filter="all"
        link={{ type, id, includeRelated }}
        emptyHint="Chưa có trao đổi nào. Bài viết gắn thẻ bản ghi này ở bất kỳ nhóm nào bạn đọc được sẽ hiện ở đây."
      />
    </div>
  );
}
