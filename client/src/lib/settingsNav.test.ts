import { describe, expect, it } from 'vitest';
import {
  SETTINGS_GROUPS,
  SETTINGS_TABS,
  foldVietnamese,
  resolveSettingsTab,
  searchSettings,
  visibleSettingsTabs,
} from './settingsNav';

describe('settingsNav', () => {
  it('moi nhom lien tuc trong mang (tieu de nhom chi ve o muc dau)', () => {
    const seen = new Set<string>();
    let previous = '';
    for (const tab of SETTINGS_TABS) {
      if (tab.group !== previous) {
        expect(seen.has(tab.group), `nhom "${tab.group}" bi tach doi`).toBe(false);
        seen.add(tab.group);
        previous = tab.group;
      }
    }
  });

  it('khong nhom nao qua bon muc', () => {
    for (const group of Object.values(SETTINGS_GROUPS)) {
      expect(SETTINGS_TABS.filter((tab) => tab.group === group).length).toBeLessThanOrEqual(4);
    }
  });

  it('khoa tab la duy nhat', () => {
    const keys = SETTINGS_TABS.map((tab) => tab.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tab cu "data" (lien ket cu, URL quay ve tu Google Drive) tro sang Sao luu', () => {
    expect(resolveSettingsTab('data')).toBe('backup');
    expect(resolveSettingsTab('email')).toBe('email');
    expect(resolveSettingsTab(null)).toBeNull();
  });

  it('bo dau tieng Viet khi so khop', () => {
    expect(foldVietnamese('Sao Lưu Đám Mây')).toBe('sao luu dam may');
  });

  it('tim theo tu khong dau, tu khoa phu va xep khop ten len truoc', () => {
    const tabs = SETTINGS_TABS;
    expect(searchSettings(tabs, 'sao luu')[0].key).toBe('backup');
    expect(searchSettings(tabs, 'smtp').map((tab) => tab.key)).toEqual(['email']);
    expect(searchSettings(tabs, 'google drive').map((tab) => tab.key)).toContain('backup');
    expect(searchSettings(tabs, 'khong-co-gi-khop')).toEqual([]);
    expect(searchSettings(tabs, '   ')).toHaveLength(tabs.length);
  });

  it('loc theo quyen: khong co quyen thi chi con Tong quan va Gioi thieu', () => {
    const keys = visibleSettingsTabs((key) => key === undefined).map((tab) => tab.key);
    expect(keys).toEqual(['overview', 'about']);
  });

  it('muc Lien ket chia se hien khi co MOT trong cac quyen', () => {
    const keys = visibleSettingsTabs((key) => key === undefined || key === 'contracts:update').map(
      (tab) => tab.key
    );
    expect(keys).toContain('shares');
  });
});
