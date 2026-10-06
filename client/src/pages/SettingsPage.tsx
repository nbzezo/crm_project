import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Search, X } from 'lucide-react';
import { useBlocker, useSearchParams } from 'react-router';
import { Button, EmptyState, Panel, focusRing } from '../components/common/ui';
import { Modal } from '../components/common/Modal';
import { Tabs } from '../components/common/Tabs';
import { PageHeader, PageShell } from '../components/common/PageShell';
import { LabelManager } from '../components/labels/LabelManager';
import { ScoringSettings } from '../components/crm/ScoringSettings';
import { t } from '../i18n/vi';
import { useUiStore } from '../stores/uiStore';
import { AiSettings } from '../components/ai/AiSettings';
import { TelegramSettings } from '../components/settings/TelegramSettings';
import { HandoverSettings } from '../components/settings/HandoverSettings';
import { TaskFlowSettings } from '../components/settings/TaskFlowSettings';
import { TaskStatusSettings } from '../components/settings/TaskStatusSettings';
import { PicklistSettings } from '../components/settings/PicklistSettings';
import { PipelineSettings } from '../components/settings/PipelineSettings';
import { ConfigProfileSettings } from '../components/settings/ConfigProfileSettings';
import { DeliverySettings } from '../components/settings/DeliverySettings';
import { EmailSettings } from '../components/settings/EmailSettings';
import { UserSettings } from '../components/settings/UserSettings';
import { OrgChartSettings } from '../components/settings/OrgChartSettings';
import { PositionSettings } from '../components/settings/PositionSettings';
import { AboutSettings } from '../components/settings/AboutSettings';
import { ShareLinksSettings } from '../components/settings/ShareLinksSettings';
import { BackupSettings, ExportSettings } from '../components/settings/DataSettings';
import { OverviewSettings } from '../components/settings/OverviewSettings';
import { dirtySummary, useSettingsDirtyStore } from '../components/settings/settingsDirty';
import { usePermissionCheck } from '../lib/permissions';
import {
  resolveSettingsTab,
  searchSettings,
  visibleSettingsTabs,
  type SettingsTab,
} from '../lib/settingsNav';

/*
 * Muc Cai dat.
 *
 * 1.32.0: danh muc trang chuyen sang lib/settingsNav.ts (nhom lai theo cau hoi
 * nguoi dung, them Tong quan, tach Trang thai cong viec, Sao luu, Xuat du lieu);
 * cot trai co o tim; doi muc / roi trang khi con thay doi chua luu thi hoi lai.
 */
export default function SettingsPage() {
  const allowed = usePermissionCheck();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleTabs = visibleSettingsTabs(allowed);
  const shownTabs = useMemo(() => searchSettings(visibleTabs, query), [visibleTabs, query]);

  /* Tab nam trong URL chu khong phai useState: F5 khong mat cho dang xem, va gui
     duoc lien ket cho dong nghiep. `?tab=data` (lien ket cu, URL quay ve tu
     Google Drive) tro sang Sao luu. */
  const requested = resolveSettingsTab(params.get('tab'));
  const validSelection = Boolean(requested && visibleTabs.some((item) => item.key === requested));
  const activeTab: SettingsTab = validSelection ? requested! : (visibleTabs[0]?.key ?? 'overview');
  const activeDef = visibleTabs.find((item) => item.key === activeTab);

  const setTab = (next: SettingsTab) => {
    setParams((prev) => {
      const copy = new URLSearchParams();
      /* Bo cac tham so cua trang cu (vd. ?drive=connected) — chung chi co nghia
         voi trang da sinh ra chung. */
      if (prev.get('tab') === next) return prev;
      copy.set('tab', next);
      return copy;
    });
  };

  /* Phim "/" mo o tim, nhu o tim cua nhieu ung dung — tru khi dang go trong o. */
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

  if (visibleTabs.length === 0) {
    return (
      <PageShell width="narrow">
        <PageHeader title={t.settings.pageTitle} className="mb-5" />
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
            if (event.key === 'Enter' && shownTabs[0]) {
              setTab(shownTabs[0].key);
              setQuery('');
            }
          }}
          placeholder="Tìm cài đặt…"
          aria-label="Tìm cài đặt"
          className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Xoá ô tìm"
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
      {query && shownTabs.length === 0 && (
        <p className="mt-2 px-1 text-xs text-tr-muted">Không có cài đặt nào khớp “{query}”.</p>
      )}
    </div>
  );

  return (
    <PageShell width="wide" spacing="none">
      <PageHeader title={t.settings.pageTitle} className="mb-5" />

      <LeaveGuard />

      {validSelection && (
        <button
          type="button"
          onClick={() =>
            setParams((prev) => {
              const next = new URLSearchParams(prev);
              next.delete('tab');
              return next;
            })
          }
          className="mb-3 flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-tr-primary md:hidden"
        >
          <ChevronLeft size={18} aria-hidden="true" /> Cài đặt
        </button>
      )}

      <Tabs
        value={activeTab}
        onChange={setTab}
        orientation="vertical"
        activation="manual"
        mobileListMode={validSelection ? 'panel' : 'list'}
        before={search}
        items={shownTabs.map((item, index) => ({
          value: item.key,
          label: item.label,
          icon: <item.icon size={15} aria-hidden="true" />,
          /* Chi muc DAU TIEN cua moi nhom mang tieu de. Dang tim thi bo tieu de:
             ket qua xep theo do khop, khong theo nhom. */
          group: query
            ? undefined
            : shownTabs[index - 1]?.group === item.group
              ? undefined
              : item.group,
        }))}
        ariaLabel={t.settings.pageTitle}
        idPrefix="settingstab"
      >
        {activeDef && (
          <header className="mb-4">
            <h2 className="text-xl font-bold tracking-[-0.01em] text-tr-text">{activeDef.label}</h2>
            <p className="mt-0.5 text-sm text-tr-subtle">{activeDef.description}</p>
          </header>
        )}
        {activeTab === 'overview' && <OverviewSettings onOpen={setTab} />}
        {activeTab === 'labels' && (
          <Panel>
            <LabelManager />
          </Panel>
        )}
        {activeTab === 'scoring' && (
          <Panel title={t.settings.scoringTitle}>
            <ScoringSettings />
          </Panel>
        )}
        {activeTab === 'pipeline' && <PipelineSettings />}
        {activeTab === 'picklists' && <PicklistSettings />}
        {activeTab === 'handover' && <HandoverSettings />}
        {activeTab === 'taskStatuses' && <TaskStatusSettings />}
        {activeTab === 'taskFlow' && <TaskFlowSettings />}
        {activeTab === 'delivery' && <DeliverySettings />}
        {activeTab === 'ai' && <AiSettings />}
        {activeTab === 'telegram' && <TelegramSettings onOpen={setTab} />}
        {activeTab === 'email' && <EmailSettings />}
        {activeTab === 'backup' && <BackupSettings />}
        {activeTab === 'export' && <ExportSettings />}
        {activeTab === 'profile' && <ConfigProfileSettings />}
        {activeTab === 'shares' && <ShareLinksSettings />}
        {activeTab === 'users' && <UserSettings />}
        {activeTab === 'org' && <OrgChartSettings />}
        {activeTab === 'positions' && <PositionSettings />}
        {activeTab === 'about' && <AboutSettings />}
      </Tabs>
    </PageShell>
  );
}

/**
 * Hoi lai khi roi muc (doi tab, bam lien ket khac trong ung dung) hoac dong tab
 * trinh duyet trong luc con thay doi chua luu o bat ky trang Cai dat nao.
 */
function LeaveGuard() {
  const sources = useSettingsDirtyStore((s) => s.sources);
  const clear = useSettingsDirtyStore((s) => s.clear);
  const pushToast = useUiStore((s) => s.pushToast);
  const dirty = Object.keys(sources).length > 0;
  const [saving, setSaving] = useState(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      (currentLocation.pathname !== nextLocation.pathname ||
        new URLSearchParams(currentLocation.search).get('tab') !==
          new URLSearchParams(nextLocation.search).get('tab'))
  );

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      /* Trinh duyet cu doi gan returnValue moi hien hop thoai. */
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const savers = Object.values(sources).map((source) => source.save);
  const canSaveAll = savers.length > 0 && savers.every(Boolean);

  const saveAndGo = async () => {
    setSaving(true);
    try {
      await Promise.all(savers.map((save) => save!()));
      clear();
      blocker.proceed?.();
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Chưa lưu được thay đổi', 'error');
      blocker.reset?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      title="Còn thay đổi chưa lưu"
      width="max-w-md"
      footer={
        <>
          <Button
            variant="ghost"
            className="mr-auto text-tr-danger"
            disabled={saving}
            onClick={() => {
              clear();
              blocker.proceed?.();
            }}
          >
            Bỏ thay đổi
          </Button>
          <Button disabled={saving} onClick={() => blocker.reset?.()}>
            Ở lại
          </Button>
          {canSaveAll && (
            <Button variant="primary" disabled={saving} onClick={() => void saveAndGo()}>
              {saving ? 'Đang lưu…' : 'Lưu và đi tiếp'}
            </Button>
          )}
        </>
      }
    >
      <p className="text-sm text-tr-subtle">
        Bạn đã sửa <b className="text-tr-text">{dirtySummary(sources)}</b> nhưng chưa lưu. Rời đi
        bây giờ sẽ mất các thay đổi này.
      </p>
    </Modal>
  );
}
