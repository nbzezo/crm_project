import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { EmptyState, ErrorState, Segmented, focusRing } from '../common/ui';
import { feedApi, feedKeys, type GroupStats, type StatsWindow } from '../../lib/feed';
import { Avatar, GroupIcon } from './FeedBits';

/*
 * Thong ke tuong tac cua nhom (1.34.0). Chi quan tri / kiem duyet nhom thay.
 * Mot chuoi so lieu duy nhat tren bieu do (bai + binh luan moi ngay) nen dung mot
 * mau — mau nhan cua theme; con lai la o so lieu va bang.
 */

type Days = '7' | '30' | '90';
const DAY_OPTIONS: { value: Days; label: string }[] = [
  { value: '7', label: '7 ngày' },
  { value: '30', label: '30 ngày' },
  { value: '90', label: '90 ngày' },
];

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Delta({
  current,
  previous,
  asPercent,
  days,
}: {
  current: number;
  previous: number;
  asPercent?: boolean;
  days: number;
}) {
  const diff = asPercent ? Math.round((current - previous) * 100) : current - previous;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;
  const text =
    diff === 0
      ? `Bằng ${days} ngày trước`
      : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}${asPercent ? ' điểm %' : ''} so với ${days} ngày trước`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-tr-subtle">
      <Icon size={13} aria-hidden="true" />
      {text}
    </span>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: React.ReactNode }) {
  return (
    <div className="rounded-panel border border-tr-border bg-tr-card p-3.5">
      <div className="text-xs font-semibold text-tr-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-tr-text">{value}</div>
      <div className="mt-1">{detail}</div>
    </div>
  );
}

function shortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Cot hoat dong moi ngay. Re chuot / cham vao cot: so lieu ngay do hien o dong tren. */
function ActivityChart({ series }: { series: GroupStats['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = series.map((d) => d.posts + d.comments);
  const max = Math.max(1, ...totals);
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  const shown = hover !== null ? series[hover] : null;
  const sum = totals.reduce((a, b) => a + b, 0);
  const labelEvery = series.length > 31 ? 14 : series.length > 7 ? 5 : 1;
  return (
    <figure className="rounded-panel border border-tr-border bg-tr-card p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-tr-text">Bài viết và bình luận mỗi ngày</span>
        <span className="text-xs text-tr-subtle tabular-nums" aria-live="polite">
          {shown
            ? `${shortDate(shown.date)}: ${shown.posts} bài · ${shown.comments} bình luận`
            : `Tổng ${sum} trong ${series.length} ngày`}
        </span>
      </figcaption>
      <div className="mt-3 flex gap-2">
        <div
          className="flex h-40 flex-col justify-between text-right text-[11px] text-tr-muted tabular-nums"
          aria-hidden="true"
        >
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div
            className="pointer-events-none absolute inset-0 flex flex-col justify-between"
            aria-hidden="true"
          >
            {ticks.map((t) => (
              <div key={t} className="border-t border-tr-border/60" />
            ))}
          </div>
          <div
            className="relative flex h-40 items-end"
            style={{ gap: series.length > 45 ? 1 : 2 }}
            role="img"
            aria-label={`Biểu đồ cột: tổng ${sum} bài viết và bình luận trong ${series.length} ngày, cao nhất ${max} trong một ngày. Bảng số liệu ở dưới.`}
            onMouseLeave={() => setHover(null)}
          >
            {series.map((day, index) => {
              const total = totals[index];
              return (
                <div
                  key={day.date}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end"
                  onMouseEnter={() => setHover(index)}
                  onTouchStart={() => setHover(index)}
                >
                  <div
                    className={`w-full rounded-t-[4px] ${hover === index ? 'bg-tr-primary-hover' : 'bg-tr-primary'}`}
                    style={{ height: total ? `${Math.max(3, (total / max) * 100)}%` : 0 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex text-[11px] text-tr-muted" aria-hidden="true">
            {series.map((day, index) => (
              <span key={day.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
                {index % labelEvery === 0 ? shortDate(day.date) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className={`cursor-pointer text-xs text-tr-primary ${focusRing}`}>
          Xem bảng số liệu
        </summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-tr-subtle">
              <tr>
                <th scope="col" className="py-1">
                  Ngày
                </th>
                <th scope="col" className="py-1 text-right">
                  Bài viết
                </th>
                <th scope="col" className="py-1 text-right">
                  Bình luận
                </th>
              </tr>
            </thead>
            <tbody>
              {series.map((day) => (
                <tr key={day.date} className="border-t border-tr-border text-tr-text tabular-nums">
                  <td className="py-1">{shortDate(day.date)}</td>
                  <td className="py-1 text-right">{day.posts}</td>
                  <td className="py-1 text-right">{day.comments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Tiles({ stats }: { stats: GroupStats }) {
  const { current: c, previous: p, days } = stats;
  const delta = (key: keyof StatsWindow) => (
    <Delta current={c[key]} previous={p[key]} days={days} />
  );
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile
        label="Thành viên hoạt động"
        value={percent(c.participation)}
        detail={
          <span className="flex flex-col">
            <span className="text-xs text-tr-subtle">
              {c.active}/{stats.members} người có đăng, bình luận, bày tỏ cảm xúc hoặc bình chọn
            </span>
            <Delta current={c.participation} previous={p.participation} asPercent days={days} />
          </span>
        }
      />
      <Tile label="Bài viết" value={String(c.posts)} detail={delta('posts')} />
      <Tile label="Bình luận" value={String(c.comments)} detail={delta('comments')} />
      <Tile label="Cảm xúc" value={String(c.reactions)} detail={delta('reactions')} />
      <Tile
        label="Tệp chia sẻ"
        value={String(c.files)}
        detail={<span className="text-xs text-tr-subtle">đính kèm trong bài</span>}
      />
    </div>
  );
}

export function GroupStatsView({ groupId }: { groupId: number }) {
  const [days, setDays] = useState<Days>('30');
  const stats = useQuery({
    queryKey: feedKeys.stats(groupId, Number(days)),
    queryFn: () => feedApi.groupStats(groupId, Number(days)),
  });
  if (stats.error) return <ErrorState onRetry={() => void stats.refetch()} />;
  const data = stats.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tr-subtle">Chỉ quản trị và kiểm duyệt nhóm thấy trang này.</p>
        <Segmented value={days} onChange={setDays} options={DAY_OPTIONS} label="Khoảng thời gian" />
      </div>
      {!data ? (
        <p role="status" className="text-sm text-tr-muted">
          Đang tính số liệu…
        </p>
      ) : (
        <>
          <Tiles stats={data} />
          <ActivityChart series={data.series} />
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-panel border border-tr-border bg-tr-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-tr-text">Đóng góp nhiều nhất</h3>
              {data.contributors.length === 0 ? (
                <p className="text-sm text-tr-muted">Chưa có ai đăng bài hay bình luận.</p>
              ) : (
                <ol className="space-y-2">
                  {data.contributors.map((person) => (
                    <li key={person.contact_id} className="flex items-center gap-2.5">
                      <Avatar id={person.contact_id} name={person.full_name} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-tr-text">
                          {person.full_name}
                        </span>
                        {person.unit_name && (
                          <span className="block truncate text-xs text-tr-subtle">
                            {person.unit_name}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-tr-subtle tabular-nums">
                        {person.posts} bài · {person.comments} bình luận
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rounded-panel border border-tr-border bg-tr-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-tr-text">Bài được quan tâm nhất</h3>
              {data.top_posts.length === 0 ? (
                <p className="text-sm text-tr-muted">Chưa có bài viết trong khoảng này.</p>
              ) : (
                <ol className="space-y-2">
                  {data.top_posts.map((post) => (
                    <li key={post.id}>
                      <Link
                        to={`/feed/posts/${post.id}`}
                        className={`block rounded-control p-1 hover:bg-tr-hover ${focusRing}`}
                      >
                        <span className="line-clamp-1 text-sm text-tr-text">
                          {post.excerpt || 'Bài viết'}
                        </span>
                        <span className="text-xs text-tr-subtle tabular-nums">
                          {post.author_name ?? '—'} · {post.reactions} cảm xúc · {post.comments}{' '}
                          bình luận
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rounded-panel border border-tr-border bg-tr-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-tr-text">Thông báo cần xác nhận</h3>
              {data.announcements.length === 0 ? (
                <p className="text-sm text-tr-muted">Không có thông báo nào yêu cầu xác nhận.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.announcements.map((a) => {
                    const rate = a.audience ? a.acks / a.audience : 0;
                    return (
                      <li key={a.id}>
                        <Link
                          to={`/feed/posts/${a.id}`}
                          className={`block hover:underline ${focusRing}`}
                        >
                          <span className="line-clamp-1 text-sm text-tr-text">{a.excerpt}</span>
                        </Link>
                        <div className="mt-1 flex items-center gap-2">
                          <div
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-tr-hover-strong"
                            aria-hidden="true"
                          >
                            <div
                              className="h-full rounded-full bg-tr-primary"
                              style={{ width: percent(rate) }}
                            />
                          </div>
                          <span className="text-xs text-tr-subtle tabular-nums">
                            {a.acks}/{a.audience} đã đọc ({percent(rate)})
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section className="rounded-panel border border-tr-border bg-tr-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-tr-text">Hỏi đáp</h3>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-xs text-tr-subtle">Câu hỏi</dt>
                  <dd className="text-xl font-bold text-tr-text tabular-nums">
                    {data.questions.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-tr-subtle">Đã chọn trả lời</dt>
                  <dd className="text-xl font-bold text-tr-text tabular-nums">
                    {data.questions.answered}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-tr-subtle">Chưa ai trả lời</dt>
                  <dd className="text-xl font-bold text-tr-text tabular-nums">
                    {data.questions.no_reply}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** Tong quan moi nhom minh quan tri — xep theo ty le thanh vien hoat dong. */
export function StatsOverview() {
  const [days, setDays] = useState<Days>('30');
  const overview = useQuery({
    queryKey: feedKeys.overview(Number(days)),
    queryFn: () => feedApi.statsOverview(Number(days)),
  });
  const rows = overview.data?.groups ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tr-subtle">
          Các nhóm bạn quản trị hoặc kiểm duyệt. Bấm tên nhóm để xem chi tiết.
        </p>
        <Segmented value={days} onChange={setDays} options={DAY_OPTIONS} label="Khoảng thời gian" />
      </div>
      {overview.error ? (
        <ErrorState onRetry={() => void overview.refetch()} />
      ) : overview.isLoading ? (
        <p role="status" className="text-sm text-tr-muted">
          Đang tính số liệu…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          message="Bạn chưa quản trị nhóm nào"
          hint="Thống kê hiện với quản trị và kiểm duyệt của nhóm."
        />
      ) : (
        <div className="overflow-x-auto rounded-panel border border-tr-border bg-tr-card">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <thead className="bg-tr-surface text-left text-xs font-semibold text-tr-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Nhóm
                </th>
                <th scope="col" className="px-3 py-2">
                  Thành viên hoạt động
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Bài
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Bình luận
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Cảm xúc
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Đã đọc thông báo
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Câu hỏi chưa chốt
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((row) => (
                <tr key={row.group.id} className="border-t border-tr-border">
                  <td className="px-3 py-2">
                    <Link
                      to={`/feed/groups/${row.group.id}/stats`}
                      className={`inline-flex items-center gap-2 font-medium text-tr-text hover:text-tr-primary ${focusRing}`}
                    >
                      <GroupIcon
                        id={row.group.id}
                        name={row.group.name}
                        color={row.group.color}
                        size={22}
                      />
                      {row.group.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-1.5 w-24 overflow-hidden rounded-full bg-tr-hover-strong"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full bg-tr-primary"
                          style={{ width: percent(row.participation) }}
                        />
                      </div>
                      <span className="text-tr-text">
                        {percent(row.participation)} · {row.active}/{row.members}
                      </span>
                    </div>
                    <Delta
                      current={row.participation}
                      previous={row.previous_participation}
                      asPercent
                      days={Number(days)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right text-tr-text">{row.posts}</td>
                  <td className="px-3 py-2 text-right text-tr-text">{row.comments}</td>
                  <td className="px-3 py-2 text-right text-tr-text">{row.reactions}</td>
                  <td className="px-3 py-2 text-right text-tr-text">
                    {row.ack_rate === null ? '—' : percent(row.ack_rate)}
                  </td>
                  <td className="px-3 py-2 text-right text-tr-text">{row.unanswered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
