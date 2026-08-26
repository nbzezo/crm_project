import type { QuickNoteColorKey } from '../../types';

/**
 * Bang mau "giay ghi chu". Moi Quick Note tu nhan mot mau theo `id % length`
 * neu khong tu chon (on dinh giua cac lan tai lai) — chon rieng thi ghi de
 * qua cot `color` (v33, xem QUICK_NOTE_COLORS trong @workflow/contracts).
 * Doi lech sang mot cap bg/text tuong phan manh o ca hai theme thay vi mot
 * mau tinh, dung theo bo chu vien tay khong dua vao mau lam tin hieu duy nhat.
 */
export interface QuickNoteColor {
  key: QuickNoteColorKey;
  name: string;
  bgLight: string;
  textLight: string;
  bgDark: string;
  textDark: string;
}

/** Thu tu O DAY khong quan trong ve mat luu tru (color luu bang `key`, khong phai chi so). */
export const QUICK_NOTE_COLORS: QuickNoteColor[] = [
  {
    key: 'yellow',
    name: 'Vàng',
    bgLight: '#fce8a8',
    textLight: '#3d3410',
    bgDark: '#5c4d12',
    textDark: '#f5eccb',
  },
  {
    key: 'green',
    name: 'Xanh lá',
    bgLight: '#c9e9cb',
    textLight: '#163a19',
    bgDark: '#204a24',
    textDark: '#d8f0da',
  },
  {
    key: 'pink',
    name: 'Hồng',
    bgLight: '#f6d3da',
    textLight: '#3a1620',
    bgDark: '#55232d',
    textDark: '#f6dbe1',
  },
  {
    key: 'purple',
    name: 'Tím',
    bgLight: '#e3d3f2',
    textLight: '#2a1638',
    bgDark: '#3b2650',
    textDark: '#e9dbf5',
  },
  {
    key: 'blue',
    name: 'Xanh dương',
    bgLight: '#cfe6f7',
    textLight: '#12283a',
    bgDark: '#1c3c54',
    textDark: '#d7ecfa',
  },
  {
    key: 'peach',
    name: 'Cam đất',
    bgLight: '#f7dcc2',
    textLight: '#3a230f',
    bgDark: '#5a3c1e',
    textDark: '#f6e2cd',
  },
];

const BY_KEY = new Map(QUICK_NOTE_COLORS.map((color) => [color.key, color]));

/** `override` la mau nguoi dung tu chon (cot `color`) — uu tien hon mau tu suy theo id. */
export function colorForNote(id: number, override?: QuickNoteColorKey | null): QuickNoteColor {
  if (override) {
    const found = BY_KEY.get(override);
    if (found) return found;
  }
  return QUICK_NOTE_COLORS[id % QUICK_NOTE_COLORS.length];
}
