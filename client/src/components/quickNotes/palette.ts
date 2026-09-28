import type { QuickNoteColorKey } from '../../types';

/**
 * Bang mau "giay ghi chu". Moi Quick Note tu nhan mot mau theo `id % length`
 * neu khong tu chon (on dinh giua cac lan tai lai) — chon rieng thi ghi de
 * qua cot `color` (v33, xem QUICK_NOTE_COLORS trong @workflow/contracts).
 * Doi lech sang mot cap bg/text tuong phan manh o ca hai theme thay vi mot
 * mau tinh, dung theo bo chu vien tay khong dua vao mau lam tin hieu duy nhat.
 */
interface QuickNoteColor {
  key: QuickNoteColorKey;
  name: string;
  bgLight: string;
  textLight: string;
  bgDark: string;
  textDark: string;
}

/**
 * Thu tu O DAY khong quan trong ve mat luu tru (color luu bang `key`, khong
 * phai chi so). Bang mau pastel lay cam hung tu Radix Colors: it bao hoa hon,
 * co sac do rieng cho light/dark va van giu chu tuong phan cao. Giu nguyen key
 * de tat ca ghi chu cu doi dien mao ma khong can migrate du lieu.
 */
export const QUICK_NOTE_COLORS: QuickNoteColor[] = [
  {
    key: 'yellow',
    name: 'Vàng',
    bgLight: '#f8e6a0',
    textLight: '#4e3d13',
    bgDark: '#51451f',
    textDark: '#f7e7a9',
  },
  {
    key: 'lime',
    name: 'Xanh chanh',
    bgLight: '#d7e8a2',
    textLight: '#34401b',
    bgDark: '#3b4822',
    textDark: '#e4f1b9',
  },
  {
    key: 'green',
    name: 'Xanh lá',
    bgLight: '#bfe3c0',
    textLight: '#173d25',
    bgDark: '#244a2c',
    textDark: '#d2ebcf',
  },
  {
    key: 'teal',
    name: 'Xanh ngọc',
    bgLight: '#b7e3dd',
    textLight: '#143c38',
    bgDark: '#234945',
    textDark: '#cdeee8',
  },
  {
    key: 'blue',
    name: 'Xanh dương',
    bgLight: '#bedaf4',
    textLight: '#173a58',
    bgDark: '#24465f',
    textDark: '#d7e9f8',
  },
  {
    key: 'indigo',
    name: 'Chàm',
    bgLight: '#cdd2f6',
    textLight: '#29315d',
    bgDark: '#353b67',
    textDark: '#e1e4fa',
  },
  {
    key: 'purple',
    name: 'Tím',
    bgLight: '#ddcbf0',
    textLight: '#43265c',
    bgDark: '#49345d',
    textDark: '#ebddfa',
  },
  {
    key: 'pink',
    name: 'Hồng',
    bgLight: '#f2c9de',
    textLight: '#5b2943',
    bgDark: '#593448',
    textDark: '#f7ddec',
  },
  {
    key: 'red',
    name: 'Đỏ',
    bgLight: '#f1c6c2',
    textLight: '#602a25',
    bgDark: '#603633',
    textDark: '#f8ddda',
  },
  {
    key: 'peach',
    name: 'Cam',
    bgLight: '#f6d2b1',
    textLight: '#5c351c',
    bgDark: '#5f412c',
    textDark: '#fae3ce',
  },
  {
    key: 'brown',
    name: 'Nâu',
    bgLight: '#ddccbc',
    textLight: '#493426',
    bgDark: '#4e4034',
    textDark: '#ebddd0',
  },
  {
    key: 'gray',
    name: 'Xám',
    bgLight: '#d8dde3',
    textLight: '#303941',
    bgDark: '#3e454c',
    textDark: '#e5e9ed',
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
