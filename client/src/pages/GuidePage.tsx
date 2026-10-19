import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { EmptyState, focusRing } from '../components/common/ui';
import { Tabs } from '../components/common/Tabs';
import { PageHeader, PageShell } from '../components/common/PageShell';
import GuideArticleBody from '../components/guide/GuideArticleBody';
import { t } from '../i18n/vi';
import { usePermissionCheck } from '../lib/permissions';
import { resolveGuideSlug, visibleGuideArticles, type GuideArticle } from '../lib/guideNav';
import { guideBody, searchGuide } from '../lib/guideBodies';

/*
 * Huong dan su dung (1.40.0).
 *
 * Cung bo khung voi trang Cai dat: cot muc luc doc o trai, o tim ngay tren cot,
 * bai dang doc nam trong URL. Khac mot diem — khi dang tim, o ben phai doi sang
 * DANH SACH KET QUA kem doan trich, vi nguoi tim chua biet minh can bai nao;
 * tra ve mot bai bat ky trong so ket qua la doan thay ho.
 */
export default function GuidePage() {
  const allowed = usePermissionCheck();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const articles = useMemo(() => visibleGuideArticles(allowed), [allowed]);
  const hits = useMemo(() => searchGuide(articles, query), [articles, query]);
  const shown = useMemo(() => hits.map((hit) => hit.article), [hits]);

  const requested = resolveGuideSlug(params.get('bai'), articles);
  const activeSlug = requested ?? articles[0]?.slug ?? '';
  const active = articles.find((article) => article.slug === activeSlug);

  const open = (slug: string) => {
    setQuery('');
    setParams((prev) => {
      if (prev.get('bai') === slug) return prev;
      const next = new URLSearchParams(prev);
      next.set('bai', slug);
      return next;
    });
  };

  /* Phim "/" mo o tim, giong trang Cai dat — tru khi dang go trong mot o nhap. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* Mo bai moi thi dua mat nguoi doc ve dau bai, tru khi link chi dich mot muc. */
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0 });
  }, [activeSlug]);

  if (articles.length === 0) {
    return (
      <PageShell width="narrow">
        <PageHeader title={t.nav.guide} className="mb-5" />
        <EmptyState message={t.permissions.noAccessTitle} hint={t.permissions.noAccessHint} />
      </PageShell>
    );
  }

  const search = (
    <div className="mb-3">
      <label
        className={`flex h-11 items-center gap-2 rounded-control border border-tr-border bg-tr-panel px-2.5 fine:h-9 ${focusRing} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tr-primary`}
      >
        <Search size={15} className="shrink-0 text-tr-muted" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setQuery('');
            if (event.key === 'Enter' && shown[0]) open(shown[0].slug);
          }}
          placeholder={t.guide.searchPlaceholder}
          aria-label={t.guide.searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label={t.guide.clearSearch}
            className="rounded-control p-0.5 text-tr-muted hover:text-tr-text"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-tr-border px-1.5 text-[11px] text-tr-muted md:inline">
            /
          </kbd>
        )}
      </label>
      {query && (
        <p className="mt-2 px-1 text-xs text-tr-muted" aria-live="polite">
          {shown.length === 0 ? t.guide.noMatch(query) : t.guide.matchCount(shown.length)}
        </p>
      )}
    </div>
  );

  const results = (
    <div className="space-y-2">
      <h2 className="text-xl font-bold tracking-[-0.01em] text-tr-text">{t.guide.resultsTitle}</h2>
      {hits.length === 0 ? (
        <EmptyState message={t.guide.noMatch(query)} hint={t.guide.noMatchHint} />
      ) : (
        <ul className="space-y-2">
          {hits.map(({ article, snippet }) => (
            <li key={article.slug}>
              <button
                type="button"
                onClick={() => open(article.slug)}
                className={`flex w-full gap-3 rounded-panel border border-tr-border bg-tr-panel p-3 text-left transition hover:bg-tr-hover ${focusRing}`}
              >
                <article.icon
                  size={16}
                  className="mt-0.5 shrink-0 text-tr-muted"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-tr-text">{article.title}</span>
                  <span className="mt-0.5 block text-xs text-tr-muted">{article.chapter}</span>
                  <span className="mt-1 block text-sm text-tr-subtle">
                    {snippet || article.summary}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const reading = active && (
    <>
      <header className="mb-4">
        <h2 className="text-xl font-bold tracking-[-0.01em] text-tr-text">{active.title}</h2>
        <p className="mt-0.5 text-sm text-tr-subtle">{active.summary}</p>
      </header>
      <GuideArticleBody body={guideBody(active.slug)} />
    </>
  );

  return (
    <PageShell width="wide" spacing="none">
      <PageHeader title={t.nav.guide} description={t.guide.pageDescription} className="mb-5" />

      {requested && !query && (
        <button
          type="button"
          onClick={() =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('bai');
              return next;
            })
          }
          className="mb-3 flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-tr-primary md:hidden"
        >
          <ChevronLeft size={18} aria-hidden="true" /> {t.nav.guide}
        </button>
      )}

      <Tabs
        value={activeSlug}
        onChange={open}
        orientation="vertical"
        activation="manual"
        mobileListMode={requested && !query ? 'panel' : 'list'}
        before={search}
        items={shown.map((article: GuideArticle, index) => ({
          value: article.slug,
          label: article.title,
          icon: <article.icon size={15} aria-hidden="true" />,
          /* Chi bai DAU TIEN cua moi chuong mang tieu de chuong. Dang tim thi bo
             tieu de: ket qua xep theo do khop chu khong theo chuong. */
          group: query
            ? undefined
            : shown[index - 1]?.chapter === article.chapter
              ? undefined
              : article.chapter,
        }))}
        ariaLabel={t.nav.guide}
        idPrefix="guide"
      >
        {query ? results : reading}
      </Tabs>
    </PageShell>
  );
}
