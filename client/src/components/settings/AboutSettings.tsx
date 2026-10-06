import { useState } from 'react';
import { CalendarDays, Check, ChevronDown, GitBranch } from 'lucide-react';
import { APP_UPDATED_AT, APP_VERSION, RELEASE_NOTES, type ReleaseNote } from '../../lib/appRelease';
import { formatDate } from '../../lib/format';
import { Logo } from '../common/Logo';
import { Panel, focusRing } from '../common/ui';

/** So ban phat hanh hien san; phan con lai mo bang nut "Xem thêm". */
const INITIAL_RELEASES = 5;

/**
 * Cai dat → Gioi thieu.
 *
 * 1.32.0: mot khoi phien ban duy nhat (truoc day so phien ban hien ba lan), bo
 * doan van co dinh "Phien ban 1.1…" da loi thoi, lich su chi mo san vai ban moi
 * nhat — cac ban cu hon gom theo ban lon (1.30.x, 1.29.x…) va mo khi can.
 */
export function AboutSettings() {
  const [showAll, setShowAll] = useState(false);
  const recent = RELEASE_NOTES.slice(0, INITIAL_RELEASES);
  const older = RELEASE_NOTES.slice(INITIAL_RELEASES);
  const olderGroups = groupByMinor(older);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Logo className="h-14 w-14 rounded-panel shadow-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-xl font-bold tracking-[-0.02em] text-tr-text">WorkFlow</h3>
              <span className="rounded-full bg-tr-primary/10 px-2 py-0.5 text-sm font-semibold text-tr-primary tabular-nums">
                v{APP_VERSION}
              </span>
            </div>
            <p className="mt-1 text-sm text-tr-subtle">
              Quản lý công việc, khách hàng B2B, cơ hội bán hàng, hợp đồng và dự án trong một hệ
              thống, trên máy tính và điện thoại.
            </p>
          </div>
          <p className="flex shrink-0 items-center gap-2 text-sm text-tr-subtle">
            <CalendarDays size={16} className="text-tr-primary" aria-hidden="true" />
            Cập nhật{' '}
            <strong className="font-semibold text-tr-text">{formatDate(APP_UPDATED_AT)}</strong>
          </p>
        </div>
      </Panel>

      <Panel title="Lịch sử thay đổi">
        <ReleaseList releases={recent} />
        {older.length > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className={`mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-tr-primary hover:bg-tr-hover fine:min-h-9 ${focusRing}`}
          >
            <ChevronDown size={15} aria-hidden="true" /> Xem {older.length} bản cũ hơn
          </button>
        )}
        {showAll &&
          olderGroups.map(([minor, releases]) => (
            <details key={minor} className="mt-3 border-t border-tr-border pt-3">
              <summary
                className={`flex min-h-9 cursor-pointer items-center gap-2 rounded-control text-sm font-semibold text-tr-text ${focusRing}`}
              >
                Phiên bản {minor}.x
                <span className="text-xs font-normal text-tr-muted">
                  {releases.length} bản · {formatDate(releases[releases.length - 1].date)} –{' '}
                  {formatDate(releases[0].date)}
                </span>
              </summary>
              <div className="mt-3">
                <ReleaseList releases={releases} />
              </div>
            </details>
          ))}
      </Panel>
    </div>
  );
}

function groupByMinor(releases: readonly ReleaseNote[]): [string, ReleaseNote[]][] {
  const groups = new Map<string, ReleaseNote[]>();
  for (const release of releases) {
    const minor = release.version.split('.').slice(0, 2).join('.');
    groups.set(minor, [...(groups.get(minor) ?? []), release]);
  }
  return [...groups.entries()];
}

function ReleaseList({ releases }: { releases: readonly ReleaseNote[] }) {
  return (
    <ol className="space-y-0">
      {releases.map((release, index) => (
        <li key={release.version} className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center" aria-hidden="true">
            <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-tr-primary/30 bg-tr-primary/10 text-tr-primary">
              <GitBranch size={14} />
            </span>
            {index < releases.length - 1 && <span className="min-h-8 w-px flex-1 bg-tr-border" />}
          </div>

          <article className={index < releases.length - 1 ? 'pb-6' : ''}>
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
                  <Check size={14} className="mt-0.5 shrink-0 text-tr-success" aria-hidden="true" />
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </article>
        </li>
      ))}
    </ol>
  );
}
