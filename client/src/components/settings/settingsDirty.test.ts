import { beforeEach, describe, expect, it } from 'vitest';
import { dirtySummary, useSettingsDirtyStore } from './settingsDirty';
import { moveItem } from './SettingsKit';

describe('settingsDirty', () => {
  beforeEach(() => useSettingsDirtyStore.getState().clear());

  it('dang ky, go va xoa het nguon thay doi', () => {
    const store = useSettingsDirtyStore.getState();
    store.set('handover', { label: 'cấu hình bàn giao' });
    store.set('email', { label: 'cấu hình Email' });
    expect(Object.keys(useSettingsDirtyStore.getState().sources)).toEqual(['handover', 'email']);
    store.set('handover', null);
    expect(Object.keys(useSettingsDirtyStore.getState().sources)).toEqual(['email']);
    store.clear();
    expect(useSettingsDirtyStore.getState().sources).toEqual({});
  });

  it('go mot nguon khong co thi khong doi state', () => {
    const before = useSettingsDirtyStore.getState();
    before.set('khong-co', null);
    expect(useSettingsDirtyStore.getState()).toBe(before);
  });

  it('tom tat gop nhan trung nhau', () => {
    expect(
      dirtySummary({
        a: { label: 'Trợ lý AI' },
        b: { label: 'Trợ lý AI' },
        c: { label: 'Telegram' },
      })
    ).toBe('Trợ lý AI, Telegram');
  });
});

describe('moveItem', () => {
  it('doi cho voi phan tu ke ben, giu nguyen o bien', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});
