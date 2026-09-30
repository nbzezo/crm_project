import { CalendarDays, Check, GitBranch } from 'lucide-react';
import { APP_UPDATED_AT, APP_VERSION, RELEASE_NOTES } from '../../lib/appRelease';
import { formatDate } from '../../lib/format';
import { Logo } from '../common/Logo';
import { Panel } from '../common/ui';

export function AboutSettings() {
  return (
    <div className="space-y-4">
      <Panel className="overflow-hidden p-0!">
        <div className="bg-tr-primary/5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Logo className="h-14 w-14 rounded-panel shadow-sm" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold tracking-[-0.02em] text-tr-text">WorkFlow</h2>
                  <span className="rounded-full bg-tr-primary/10 px-2 py-0.5 text-xs font-semibold text-tr-primary">
                    v{APP_VERSION}
                  </span>
                </div>
                <p className="mt-1 text-sm text-tr-subtle">
                  Quản lý công việc, khách hàng và hoạt động kinh doanh trên một nền tảng thống
                  nhất.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-control border border-tr-border bg-tr-panel px-3 py-2 text-sm text-tr-subtle">
              <CalendarDays size={16} className="text-tr-primary" aria-hidden="true" />
              <span>
                Cập nhật{' '}
                <strong className="font-semibold text-tr-text">{formatDate(APP_UPDATED_AT)}</strong>
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-px border-t border-tr-border bg-tr-border sm:grid-cols-2">
          <VersionDetail label="Phiên bản hiện tại" value={`v${APP_VERSION}`} />
          <VersionDetail label="Ngày cập nhật" value={formatDate(APP_UPDATED_AT)} />
        </div>
      </Panel>

      <Panel title="Giới thiệu chung">
        <div className="space-y-3 text-sm leading-6 text-tr-subtle">
          <p>
            WorkFlow giúp doanh nghiệp tổ chức công việc hằng ngày, quản lý khách hàng B2B, theo dõi
            cơ hội bán hàng, hợp đồng, doanh thu và tiến độ dự án trong cùng một hệ thống.
          </p>
          <p>
            Dữ liệu được kết nối xuyên suốt giữa đội ngũ, quy trình và báo cáo, giúp mỗi người nắm
            rõ việc cần làm còn nhà quản lý có đủ thông tin để ra quyết định.
          </p>
        </div>
      </Panel>

      <Panel title="Lịch sử thay đổi phiên bản">
        <ol className="space-y-0">
          {RELEASE_NOTES.map((release, index) => (
            <li
              key={release.version}
              className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3"
            >
              <div className="flex flex-col items-center" aria-hidden="true">
                <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-tr-primary/30 bg-tr-primary/10 text-tr-primary">
                  <GitBranch size={14} />
                </span>
                {index < RELEASE_NOTES.length - 1 && (
                  <span className="min-h-8 w-px flex-1 bg-tr-border" />
                )}
              </div>

              <article className={index < RELEASE_NOTES.length - 1 ? 'pb-6' : ''}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="font-semibold text-tr-text">
                    v{release.version} · {release.title}
                  </h3>
                  <time dateTime={release.date} className="text-xs text-tr-muted">
                    {formatDate(release.date)}
                  </time>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {release.changes.map((change) => (
                    <li key={change} className="flex gap-2 text-sm leading-5 text-tr-subtle">
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0 text-tr-success"
                        aria-hidden="true"
                      />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function VersionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-tr-panel px-5 py-3.5 sm:px-6">
      <p className="text-xs text-tr-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-tr-text tabular-nums">{value}</p>
    </div>
  );
}
