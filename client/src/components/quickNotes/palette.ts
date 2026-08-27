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

/**
 * Thu tu O DAY khong quan trong ve mat luu tru (color luu bang `key`, khong
 * phai chi so). 12 mau, do dam hon ban dau (nguoi dung phan hoi "hien tai hoi
 * it va hoi nhat") — S/L day hon nhung van giu du tuong phan voi text dam mau.
 */
export const QUICK_NOTE_COLORS: QuickNoteColor[] = [
  {
    key: 'yellow',
    name: 'Vàng',
    bgLight: '#f7d154',
    textLight: '#453600',
    bgDark: '#6b5108',
    textDark: '#faeab8',
  },
  {
    key: 'lime',
    name: 'Xanh chanh',
    bgLight: '#c3e368',
    textLight: '#2e3c02',
    bgDark: '#48540f',
    textDark: '#e7f2c1',
  },
  {
    key: 'green',
    name: 'Xanh lá',
    bgLight: '#8fd89e',
    textLight: '#0c3316',
    bgDark: '#1c5028',
    textDark: '#cdeed4',
  },
  {
    key: 'teal',
    name: 'Xanh ngọc',
    bgLight: '#7bd6cd',
    textLight: '#083631',
    bgDark: '#155249',
    textDark: '#c7ede8',
  },
  {
    key: 'blue',
    name: 'Xanh dương',
    bgLight: '#8ec3f2',
    textLight: '#0c2a4a',
    bgDark: '#1b3f61',
    textDark: '#cfe4fa',
  },
  {
    key: 'indigo',
    name: 'Chàm',
    bgLight: '#a3a8f0',
    textLight: '#1c1c53',
    bgDark: '#2e2f68',
    textDark: '#dcddf9',
  },
  {
    key: 'purple',
    name: 'Tím',
    bgLight: '#c9a3ee',
    textLight: '#31114a',
    bgDark: '#432160',
    textDark: '#ecdcf9',
  },
  {
    key: 'pink',
    name: 'Hồng',
    bgLight: '#f0a0c4',
    textLight: '#4a1330',
    bgDark: '#652141',
    textDark: '#f9dceb',
  },
  {
    key: 'red',
    name: 'Đỏ',
    bgLight: '#ec9797',
    textLight: '#460b0b',
    bgDark: '#652020',
    textDark: '#f8d9d9',
  },
  {
    key: 'peach',
    name: 'Cam',
    bgLight: '#f5b06a',
    textLight: '#452502',
    bgDark: '#6b4110',
    textDark: '#f9e0c1',
  },
  {
    key: 'brown',
    name: 'Nâu',
    bgLight: '#c19b76',
    textLight: '#3a2413',
    bgDark: '#4d3620',
    textDark: '#ecdac6',
  },
  {
    key: 'gray',
    name: 'Xám',
    bgLight: '#b8c0c8',
    textLight: '#20262b',
    bgDark: '#3b4147',
    textDark: '#e5e9ec',
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
