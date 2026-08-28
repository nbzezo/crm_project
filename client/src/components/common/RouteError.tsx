/**
 * Man hinh loi cap route.
 *
 * Truoc day router khong khai bao `errorElement` nen moi loi render — hoac mot
 * chunk `lazy()` khong tai duoc — deu roi vao man hinh mac dinh tieng Anh cua
 * react-router. Voi 22 trang deu lazy-load, tinh huong hay gap nhat khong phai
 * bug hiem ma la: tab dang mo, deploy ban moi, chunk cu bi thay the.
 *
 * Hai lop tach bach:
 *  - `RouteErrorPage` gan vao `errorElement` cua route goc. No thay the ca
 *    <App />, nen phai tu dung khung rieng (khong co Topbar/Sidebar).
 *  - `NotFoundPage` la route con `path: '*'`, nen van nam trong khung app va
 *    giu nguyen thanh dieu huong — nguoi dung lac duong khong bi mat luon loi ra.
 */
import type { ReactNode } from 'react';
import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router';
import { AlertTriangle, RefreshCw, Compass } from 'lucide-react';
import { Button, focusRing } from './ui';
import { PageHeader, PageShell } from './PageShell';
import { t } from '../../i18n/vi';

/**
 * Vite doi ten file theo hash moi lan build, nen chunk cu tra ve 404 va trinh
 * duyet nem dung mot trong may thong diep nay. Day khong phai loi cua trang —
 * chi la ban dang mo da cu — nen thong diep phai khac han loi crash that su.
 */
function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    /dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}

function reload(): void {
  window.location.reload();
}

export function RouteErrorPage() {
  const error = useRouteError();

  // Route khong khop se nem mot Response 404. No van co the toi day khi URL sai
  // nam ngoai cay route con (vi du loi tu chinh route goc).
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <ErrorShell
        icon={<Compass size={30} aria-hidden="true" />}
        title={t.routeError.notFoundTitle}
        body={t.routeError.notFoundBody}
      />
    );
  }

  const stale = isStaleChunkError(error);

  return (
    <ErrorShell
      icon={<AlertTriangle size={30} aria-hidden="true" />}
      title={stale ? t.routeError.staleTitle : t.routeError.crashTitle}
      body={stale ? t.routeError.staleBody : t.routeError.crashBody}
      detail={stale ? undefined : errorDetail(error)}
      primary={
        <Button variant="primary" onClick={reload}>
          <RefreshCw size={15} aria-hidden="true" />
          {t.routeError.reload}
        </Button>
      }
    />
  );
}

/** Route `*`: van o trong khung app nen thanh dieu huong con nguyen. */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <PageShell width="narrow">
      <PageHeader title={t.routeError.notFoundTitle} description={t.routeError.notFoundBody} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => navigate(-1)}>
          Quay lại trang trước
        </Button>
        <Button onClick={() => navigate('/')}>{t.routeError.home}</Button>
      </div>
    </PageShell>
  );
}

function errorDetail(error: unknown): string | undefined {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.stack ?? error.message;
  return undefined;
}

function ErrorShell({
  icon,
  title,
  body,
  detail,
  primary,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  detail?: string;
  primary?: ReactNode;
}) {
  return (
    /* `errorElement` thay the ca <App />, nen khong con .tr-app-shell de an theo —
       khoi nay phai tu ve nen va mau chu tu token. */
    <div className="tr-app-stage flex min-h-full items-center justify-center p-6">
      <div
        role="alert"
        className="tr-bento-card w-full max-w-lg rounded-modal border border-tr-border bg-tr-panel p-7 text-center"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tr-danger/12 text-tr-danger">
          {icon}
        </div>
        <h1 className="text-xl font-semibold text-tr-text">{title}</h1>
        <p className="mx-auto mt-2 max-w-prose text-sm text-tr-subtle">{body}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {primary}
          <Link
            to="/"
            reloadDocument
            className={`tr-button tr-button-secondary inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control border border-tr-border bg-tr-panel px-4 text-sm font-medium text-tr-text shadow-sm transition hover:bg-tr-hover-strong fine:min-h-[32px] ${focusRing}`}
          >
            {t.routeError.home}
          </Link>
        </div>

        {detail && (
          <details className="mt-6 text-left">
            <summary className={`text-xs text-tr-muted ${focusRing}`}>
              {t.routeError.details}
            </summary>
            <pre className="tr-scroll mt-2 max-h-48 overflow-auto rounded-control bg-tr-list p-3 text-xs whitespace-pre-wrap text-tr-muted">
              {detail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
