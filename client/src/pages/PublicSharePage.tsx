import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Download, Eye, FileText, Lock } from 'lucide-react';
import { formatDate, formatDateTime, formatVND } from '../lib/format';
import { SHARE_ENTITY_LABEL, type ShareEntityType } from '../lib/share';
import { t } from '../i18n/vi';

/*
 * Trang xem cong khai cua lien ket chia se — KHONG dang nhap, KHONG co khung app.
 *
 * Dung fetch thang thay vi `api`: `api` coi moi 401 la "het phien dang nhap" va
 * day nguoi dung ve man hinh dang nhap, trong khi o day 401 chi co nghia la
 * "can nhap mat khau cua lien ket".
 */

interface SharedFile {
  id: number;
  name: string;
  file_name: string;
  mime: string;
  size: number;
}

interface PublicRun {
  t: string;
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  c?: true;
  href?: string;
}

interface PublicBlock {
  type:
    | 'paragraph'
    | 'heading'
    | 'bullet'
    | 'number'
    | 'check'
    | 'quote'
    | 'code'
    | 'divider'
    | 'table'
    | 'omitted';
  level?: number;
  checked?: boolean;
  runs: PublicRun[];
  rows?: PublicRun[][][];
  children: PublicBlock[];
}

interface Payload {
  requires_password: false;
  type: ShareEntityType;
  title: string;
  fields: Record<string, string | number | null>;
  blocks?: PublicBlock[];
  files: SharedFile[];
  allow_download: boolean;
  locked_version: boolean;
  expires_at: string | null;
  shared_by: string;
}

interface Locked {
  requires_password: true;
  type: ShareEntityType;
  shared_by: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'locked'; data: Locked }
  | { kind: 'ready'; data: Payload };

const PREVIEWABLE = (mime: string) =>
  mime === 'application/pdf' ||
  mime === 'image/png' ||
  mime === 'image/jpeg' ||
  mime === 'text/plain' ||
  mime === 'text/csv' ||
  mime.startsWith('audio/');

type Row = [label: string, value: string];

function rowsFor(data: Payload): Row[] {
  const f = data.fields;
  const text = (key: string): string => (f[key] == null ? '' : String(f[key]));
  const money = (key: string): string => (typeof f[key] === 'number' ? formatVND(f[key] as number) : '');
  const date = (key: string): string => formatDate(text(key));
  const rows: Row[] =
    data.type === 'quotation'
      ? [
          ['Mã báo giá', text('code')],
          ['Phiên bản', text('version') ? `v${text('version')}` : ''],
          ['Khách hàng', text('customer_name')],
          ['Ngày báo giá', date('quote_date')],
          ['Giá trị', money('value_vnd')],
          ['Hiệu lực đến', date('valid_until')],
          ['Trạng thái', t.quotationStatus[text('status')] ?? text('status')],
        ]
      : data.type === 'contract'
        ? [
            ['Số hợp đồng', text('number')],
            ['Tên hợp đồng', text('name')],
            ['Khách hàng', text('customer_name')],
            ['Giá trị', money('value_vnd')],
            ['Ngày ký', date('sign_date')],
            ['Hiệu lực từ', date('start_date')],
            ['Hiệu lực đến', date('end_date')],
            ['Trạng thái', t.contractStatus[text('status')] ?? text('status')],
            ['Điều khoản thanh toán', text('payment_terms')],
          ]
        : data.type === 'page'
          ? [['Thời gian họp', text('purpose_key') === 'meeting' ? formatDateTime(text('meeting_at')) : '']]
          : [['Mô tả', text('description')]];
  return rows.filter(([, value]) => value);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Runs({ runs }: { runs: PublicRun[] }) {
  return (
    <>
      {runs.map((run, index) => {
        let node: ReactNode = run.t;
        if (run.c) node = <code className="rounded bg-tr-hover px-1 py-0.5 text-[0.9em]">{node}</code>;
        if (run.b) node = <strong>{node}</strong>;
        if (run.i) node = <em>{node}</em>;
        if (run.u) node = <u>{node}</u>;
        if (run.s) node = <s>{node}</s>;
        if (run.href) {
          node = (
            <a
              href={run.href}
              target="_blank"
              rel="noreferrer noopener nofollow"
              className="text-tr-primary underline"
            >
              {node}
            </a>
          );
        }
        return <span key={index}>{node}</span>;
      })}
    </>
  );
}

/** Cay khoi da duoc may chu loc; chi dung phan tu React (khong dangerouslySetInnerHTML). */
function Blocks({ blocks }: { blocks: PublicBlock[] }) {
  let counter = 0;
  return (
    <>
      {blocks.map((block, index) => {
        counter = block.type === 'number' ? counter + 1 : 0;
        const kids = block.children.length > 0 && (
          <div className="ml-5">
            <Blocks blocks={block.children} />
          </div>
        );
        switch (block.type) {
          case 'heading': {
            const cls = ['text-xl font-bold', 'text-lg font-semibold', 'text-base font-semibold'][
              (block.level ?? 1) - 1
            ];
            const Tag = (['h2', 'h3', 'h4'] as const)[(block.level ?? 1) - 1];
            return (
              <div key={index} className="mt-4">
                <Tag className={cls}>
                  <Runs runs={block.runs} />
                </Tag>
                {kids}
              </div>
            );
          }
          case 'bullet':
          case 'number':
          case 'check':
            return (
              <div key={index}>
                <p className="flex gap-2">
                  <span aria-hidden="true" className="w-5 shrink-0 text-right text-tr-muted">
                    {block.type === 'bullet' ? '•' : block.type === 'number' ? `${counter}.` : block.checked ? '☑' : '☐'}
                  </span>
                  <span className={block.type === 'check' && block.checked ? 'text-tr-muted line-through' : ''}>
                    <Runs runs={block.runs} />
                  </span>
                </p>
                {kids}
              </div>
            );
          case 'quote':
            return (
              <div key={index} className="my-1 border-l-4 border-tr-border pl-3 text-tr-subtle">
                <Runs runs={block.runs} />
                {kids}
              </div>
            );
          case 'code':
            return (
              <pre key={index} className="my-1 overflow-x-auto rounded-control bg-tr-hover p-2 text-sm">
                <Runs runs={block.runs} />
              </pre>
            );
          case 'divider':
            return <hr key={index} className="my-3 border-tr-border" />;
          case 'table':
            return (
              <div key={index} className="my-2 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {(block.rows ?? []).map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="border border-tr-border px-2 py-1 align-top">
                            <Runs runs={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'omitted':
            return (
              <p key={index} className="my-1 text-sm">
                <Runs runs={block.runs} />
              </p>
            );
          default:
            return (
              <div key={index} className="min-h-[1.5em]">
                <p>
                  <Runs runs={block.runs} />
                </p>
                {kids}
              </div>
            );
        }
      })}
    </>
  );
}

export default function PublicSharePage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [access, setAccess] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Tài liệu được chia sẻ';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(
    async (code: string | null) => {
      try {
        const res = await fetch(`/api/public/share/${token}`, {
          headers: code ? { 'X-Share-Access': code } : undefined,
        });
        const json = (await res.json()) as (Payload | Locked) & { error?: string };
        if (!res.ok) {
          setState({ kind: 'error', message: json.error ?? 'Không mở được liên kết này' });
          return;
        }
        setState(
          json.requires_password
            ? { kind: 'locked', data: json as Locked }
            : { kind: 'ready', data: json as Payload }
        );
      } catch {
        setState({ kind: 'error', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' });
      }
    },
    [token]
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setPasswordError('');
    try {
      const res = await fetch(`/api/public/share/${token}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { access?: string; error?: string };
      if (!res.ok || !json.access) {
        setPasswordError(json.error ?? 'Mật khẩu không đúng');
        return;
      }
      setAccess(json.access);
      setPassword('');
      await load(json.access);
    } finally {
      setBusy(false);
    }
  }

  const fileUrl = (file: SharedFile, download: boolean): string => {
    const params = new URLSearchParams();
    if (access) params.set('a', access);
    if (download) params.set('download', '1');
    const query = params.toString();
    return `/api/public/share/${token}/file/${file.id}${query ? `?${query}` : ''}`;
  };

  return (
    <main className="min-h-dvh bg-tr-bg px-4 py-8 text-tr-text">
      <div className="mx-auto w-full max-w-2xl">
        {state.kind === 'loading' && <p className="text-center text-tr-muted">Đang tải…</p>}

        {state.kind === 'error' && (
          <div role="alert" className="rounded-card border border-tr-border bg-tr-panel p-6 text-center">
            <p className="text-lg font-semibold">Không mở được liên kết</p>
            <p className="mt-2 text-sm text-tr-subtle">{state.message}</p>
            <p className="mt-3 text-xs text-tr-muted">
              Hãy liên hệ người đã gửi liên kết cho bạn để được cấp liên kết mới.
            </p>
          </div>
        )}

        {state.kind === 'locked' && (
          <form
            onSubmit={unlock}
            className="rounded-card border border-tr-border bg-tr-panel p-6"
            aria-labelledby="share-lock-title"
          >
            <p id="share-lock-title" className="flex items-center gap-2 text-lg font-semibold">
              <Lock size={18} aria-hidden="true" /> Nội dung được bảo vệ bằng mật khẩu
            </p>
            <p className="mt-1 text-sm text-tr-subtle">
              {state.data.shared_by
                ? `${state.data.shared_by} đã chia sẻ ${SHARE_ENTITY_LABEL[state.data.type].toLowerCase()} này với bạn.`
                : 'Nhập mật khẩu mà người gửi đã cung cấp.'}
            </p>
            <label htmlFor="share-password" className="mt-4 block text-xs font-semibold text-tr-subtle">
              Mật khẩu
            </label>
            <input
              id="share-password"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={passwordError ? true : undefined}
              className="tr-field-control mt-1 w-full rounded-control border border-tr-border bg-tr-list px-3 py-2 text-tr-text outline-none focus:border-tr-primary"
            />
            {passwordError && (
              <p role="alert" className="mt-1 text-xs text-tr-danger">
                {passwordError}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="mt-4 min-h-[44px] w-full rounded-control bg-tr-primary px-4 py-2 text-sm font-medium text-tr-on-primary disabled:opacity-50"
            >
              {busy ? 'Đang kiểm tra…' : 'Mở'}
            </button>
          </form>
        )}

        {state.kind === 'ready' && (
          <article className="rounded-card border border-tr-border bg-tr-panel p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-tr-muted">
              {SHARE_ENTITY_LABEL[state.data.type]}
            </p>
            <h1 className="mt-1 text-xl font-semibold">{state.data.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-tr-muted">
              <Eye size={13} aria-hidden="true" /> Chỉ xem
              {state.data.shared_by && ` · chia sẻ bởi ${state.data.shared_by}`}
              {state.data.locked_version && ' · phiên bản đã chốt'}
            </p>

            {rowsFor(state.data).length > 0 && (
              <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {rowsFor(state.data).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold text-tr-subtle">{label}</dt>
                    <dd className="whitespace-pre-wrap">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {state.data.blocks && (
              <section className="mt-5 text-[0.95rem] leading-relaxed" aria-label="Nội dung trang">
                {state.data.blocks.length === 0 ? (
                  <p className="text-sm text-tr-muted">Trang này chưa có nội dung.</p>
                ) : (
                  <Blocks blocks={state.data.blocks} />
                )}
              </section>
            )}

            {state.data.files.length > 0 && (
              <section className="mt-5" aria-label="Tệp đính kèm">
                <h2 className="mb-2 text-sm font-semibold">Tệp đính kèm</h2>
                <ul className="space-y-4">
                  {state.data.files.map((file) => (
                    <li key={file.id} className="rounded-control border border-tr-border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <FileText size={16} aria-hidden="true" />
                        <span className="min-w-0 flex-1 break-words font-medium">{file.file_name}</span>
                        <span className="text-xs text-tr-muted">{formatSize(file.size)}</span>
                        {state.data.allow_download && (
                          <a
                            href={fileUrl(file, true)}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-tr-border px-2.5 text-sm hover:bg-tr-hover"
                          >
                            <Download size={14} aria-hidden="true" /> Tải về
                          </a>
                        )}
                      </div>
                      {PREVIEWABLE(file.mime) ? (
                        file.mime.startsWith('image/') ? (
                          <img
                            src={fileUrl(file, false)}
                            alt={file.name}
                            className="mt-3 max-h-[70vh] w-full rounded-control object-contain"
                          />
                        ) : file.mime.startsWith('audio/') ? (
                          <audio controls src={fileUrl(file, false)} className="mt-3 w-full" />
                        ) : (
                          <iframe
                            src={fileUrl(file, false)}
                            title={file.name}
                            className="mt-3 h-[70vh] w-full rounded-control border border-tr-border bg-white"
                          />
                        )
                      ) : (
                        !state.data.allow_download && (
                          <p className="mt-2 text-xs text-tr-muted">
                            Loại tệp này không xem trực tiếp được trên trình duyệt.
                          </p>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="mt-5 text-xs text-tr-muted">
              {state.data.expires_at
                ? `Liên kết có hiệu lực đến ${formatDateTime(state.data.expires_at.replace(' ', 'T'))}.`
                : 'Liên kết không có hạn sử dụng.'}{' '}
              Lượt truy cập được ghi lại (thời gian và địa chỉ IP) để người chia sẻ biết nội dung đã được xem.
            </p>
          </article>
        )}
      </div>
    </main>
  );
}
