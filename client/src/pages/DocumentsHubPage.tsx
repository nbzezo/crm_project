import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { FileText, FolderOpen, Plus, Upload } from 'lucide-react';
import { api, qs } from '../api/client';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { Tabs } from '../components/common/Tabs';
import { Button, EmptyState } from '../components/common/ui';
import { DocumentPagesLibrary } from '../components/documents/DocumentPagesLibrary';
import { DocumentsLibrary } from '../components/documents/DocumentsLibrary';
import { CrossTabHint } from '../components/documents/DocumentsToolbar';
import type { MeetingNoteFacets } from '../types';
import { usePermissionCheck } from '../lib/permissions';
import { t } from '../i18n/vi';

/**
 * Trang "Tài liệu" gop hai chuc nang tung nam o hai muc sidebar cach xa nhau:
 * - tab "Trang tài liệu": soan ghi chu, tai lieu du an (truoc day /notes)
 * - tab "Tệp tải lên": tai len va luu tru tep (truoc day /documents)
 *
 * Tab nam tren URL (`?tab=pages|files`) nen F5 va chia se link giu dung tab.
 * `?open=<id>` (mo mot trang) va `?focus=<id>` (to sang mot tep) van chay
 * nhu cu va tu suy ra tab khi thieu `?tab`. Link cu /notes duoc main.tsx
 * chuyen huong ve day.
 *
 * Route khong khai `permission`: mo duoc khi co MOT trong hai quyen, con
 * App.tsx chi kiem duoc mot khoa. Trang tu kiem va tu an tab khong co quyen.
 *
 * 1.28.0: tu khoa tim nam o day (`?q=`) va dung chung cho hai tab — doi tab giu
 * nguyen tu khoa, va moi tab bao so ket qua cua tab kia ("Có 3 tệp khớp…").
 * Nut thao tac chinh (Tạo trang / Tải tệp lên) dat co dinh cuoi hang tab.
 */
type DocTab = 'pages' | 'files';
const TAB_STORAGE_KEY = 'workflow-documents-tab-v1';

function isDocTab(value: unknown): value is DocTab {
  return value === 'pages' || value === 'files';
}

function loadStoredTab(): DocTab | null {
  try {
    const value = localStorage.getItem(TAB_STORAGE_KEY);
    return isDocTab(value) ? value : null;
  } catch {
    return null;
  }
}

export default function DocumentsHubPage() {
  const allowed = usePermissionCheck();
  const canPages = allowed('notes:read');
  const canFiles = allowed('documents:read');
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(() => params.get('q') ?? '');
  const query = params.get('q')?.trim() ?? '';
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  /* Go → doi 250ms → ghi `?q=` (replace: khong de moi phim go thanh mot buoc
     lich su). URL la nguon su that cho API va so dem tren tab. Chi chay khi
     `term` doi — URL doi vi ly do khac (Back, mo trang) khong bi ghi de. */
  const queryRef = useRef(query);
  queryRef.current = query;
  const writtenRef = useRef(query);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (queryRef.current === term.trim()) return;
      writtenRef.current = term.trim();
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (term.trim()) next.set('q', term.trim());
          else next.delete('q');
          return next;
        },
        { replace: true }
      );
    }, 250);
    return () => window.clearTimeout(id);
  }, [term, setParams]);

  /* URL doi tu ngoai (Back/Forward, link) → dua o tim ve dung tu khoa. Bo qua
     gia tri chinh trang nay vua ghi: luc do nguoi dung co the da go them. */
  useEffect(() => {
    if (query === writtenRef.current) return;
    writtenRef.current = query;
    setTerm(query);
  }, [query]);

  const { data: pageCount } = useQuery({
    queryKey: ['meeting-notes', 'facets', { q: query }],
    queryFn: () => api.get<MeetingNoteFacets>(`/api/meeting-notes/facets${qs({ q: query })}`),
    enabled: canPages,
    select: (data) => data.total,
  });
  const { data: fileCount } = useQuery({
    queryKey: ['documents', 'count', query],
    queryFn: () => api.get<{ count: number }>(`/api/documents/count${qs({ q: query })}`),
    enabled: canFiles,
    select: (data) => data.count,
  });

  if (!canPages && !canFiles) {
    return (
      <PageShell>
        <EmptyState message={t.permissions.noAccessTitle} hint={t.permissions.noAccessHint} />
      </PageShell>
    );
  }

  const raw = params.get('tab');
  const inferred: DocTab | null = params.get('open')
    ? 'pages'
    : params.get('focus')
      ? 'files'
      : null;
  let tab: DocTab = isDocTab(raw) ? raw : (inferred ?? loadStoredTab() ?? 'pages');
  if (tab === 'pages' && !canPages) tab = 'files';
  if (tab === 'files' && !canFiles) tab = 'pages';

  const setTab = (next: DocTab) => {
    // Doi tab thi bo `open`/`focus` — chung chi co nghia voi tab cu. Giu `q`.
    const search = new URLSearchParams({ tab: next });
    if (query) search.set('q', query);
    setParams(search, { replace: true });
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Trinh duyet chan storage van doi tab duoc trong phien.
    }
  };

  const items: { value: DocTab; label: string; icon: ReactNode; count?: number }[] = [];
  if (canPages)
    items.push({
      value: 'pages',
      label: t.documentsHub.tabPages,
      icon: <FileText size={15} aria-hidden="true" />,
      count: pageCount,
    });
  if (canFiles)
    items.push({
      value: 'files',
      label: t.documentsHub.tabFiles,
      icon: <FolderOpen size={15} aria-hidden="true" />,
      count: fileCount,
    });

  /* Goi y cheo tab chi khi dang tim va tab kia co ket qua. */
  const otherCount = tab === 'pages' ? (canFiles ? fileCount : 0) : canPages ? pageCount : 0;
  const crossHint =
    query && otherCount ? (
      <CrossTabHint onClick={() => setTab(tab === 'pages' ? 'files' : 'pages')}>
        {tab === 'pages' ? (
          <FolderOpen size={14} aria-hidden="true" />
        ) : (
          <FileText size={14} aria-hidden="true" />
        )}
        {tab === 'pages'
          ? t.documentsHub.crossToFiles(otherCount, query)
          : t.documentsHub.crossToPages(otherCount, query)}
      </CrossTabHint>
    ) : null;

  /* Dang mo mot trang (?open=) thi an nut tao — trinh soan da chiem ca vung. */
  const action =
    tab === 'pages' ? (
      params.get('open') ? null : (
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={15} aria-hidden="true" />
          {/* Man hep: chi icon de hang tab con cho cho so dem. */}
          <span className="max-sm:sr-only">Tạo trang</span>
        </Button>
      )
    ) : (
      <Button variant="primary" onClick={() => setUploadOpen(true)}>
        <Upload size={15} aria-hidden="true" />
        <span className="max-sm:sr-only">Tải tệp lên</span>
      </Button>
    );

  return (
    /* `wide` cho ca hai tab de bo cuc khong nhay khi doi tab — editor BlockNote
       da tu gioi han be rong doc (xem .meeting-note-canvas trong index.css). */
    <PageShell width="wide">
      <PageHeader description={t.documentsHub.description} />
      <Tabs
        value={tab}
        onChange={setTab}
        items={items}
        ariaLabel={t.documentsHub.tabsLabel}
        idPrefix="documents-hub"
        panelClassName="pt-4"
        actions={action}
      >
        {tab === 'pages' ? (
          <DocumentPagesLibrary
            term={term}
            onTermChange={setTerm}
            query={query}
            crossHint={crossHint}
            createOpen={createOpen}
            onCreateOpenChange={setCreateOpen}
          />
        ) : (
          <DocumentsLibrary
            term={term}
            onTermChange={setTerm}
            query={query}
            crossHint={crossHint}
            uploadOpen={uploadOpen}
            onUploadOpenChange={setUploadOpen}
          />
        )}
      </Tabs>
    </PageShell>
  );
}
