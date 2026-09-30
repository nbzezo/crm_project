import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { FileText, FolderOpen } from 'lucide-react';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { Tabs } from '../components/common/Tabs';
import { EmptyState } from '../components/common/ui';
import { MeetingNotesPanel } from '../components/crm/meetingNotes/MeetingNotesPanel';
import { DocumentsLibrary } from '../components/documents/DocumentsLibrary';
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
    // Doi tab thi bo `open`/`focus` — chung chi co nghia voi tab cu.
    setParams(new URLSearchParams({ tab: next }), { replace: true });
    try {
      localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
      // Trinh duyet chan storage van doi tab duoc trong phien.
    }
  };

  const items: { value: DocTab; label: string; icon: ReactNode }[] = [];
  if (canPages)
    items.push({
      value: 'pages',
      label: t.documentsHub.tabPages,
      icon: <FileText size={15} aria-hidden="true" />,
    });
  if (canFiles)
    items.push({
      value: 'files',
      label: t.documentsHub.tabFiles,
      icon: <FolderOpen size={15} aria-hidden="true" />,
    });

  return (
    /* `wide` cho ca hai tab de bo cuc khong nhay khi doi tab — editor BlockNote
       da tu gioi han be rong doc (xem .meeting-note-canvas trong index.css). */
    <PageShell width="wide">
      <PageHeader
        description={
          tab === 'pages' ? t.documentsHub.pagesDescription : t.documentsHub.filesDescription
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={items}
        ariaLabel={t.documentsHub.tabsLabel}
        idPrefix="documents-hub"
        panelClassName="pt-4"
      >
        {tab === 'pages' ? (
          <MeetingNotesPanel
            links={{}}
            customerId={null}
            showContext
            initialSelectedId={Number(params.get('open')) || null}
          />
        ) : (
          <DocumentsLibrary />
        )}
      </Tabs>
    </PageShell>
  );
}
