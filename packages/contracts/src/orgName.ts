/*
 * Chuan hoa ten to chuc: viet hoa chu dau moi tu, con lai viet thuong.
 *   "CÔNG TY CỔ PHẦN TẬP ĐOÀN GOLDEN GATE" -> "Công Ty Cổ Phần Tập Đoàn Golden Gate"
 *   "Công ty cổ phần Sao Mai"             -> "Công Ty Cổ Phần Sao Mai"
 *
 * Hai che do, de khong bao gio "cai nhau" voi nguoi dung:
 *  - Ca ten viet HOA toan bo (thuong la du lieu dang ky kinh doanh hoac dan tu
 *    van ban): ha moi tu ve dang Hoa Dau. Tu khong co nguyen am (TNHH, MTV,
 *    TMCP, FPT, VNPT...) va so La Ma (II, IV...) la viet tat — giu nguyen.
 *  - Ten da co chu thuong: chi viet hoa chu dau cua tu dang bat dau bang chu
 *    thuong (tu khong nguyen am nhu "tnhh" thanh "TNHH"). Tu nguoi dung da go
 *    hoa ("HUD", "VinFast", "eBay") giu nguyen.
 * Ham luy dang: chuan hoa lan hai khong doi gi them.
 */

const VOWELS = /[aăâeêioôơuưyàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/iu;
const ROMAN = /^[IVX]{1,4}$/;

function capitalize(word: string): string {
  const lower = word.toLocaleLowerCase('vi');
  return lower.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('vi'));
}

function fromAllCaps(word: string): string {
  const letters = word.replace(/[^\p{L}]/gu, '');
  if (!letters) return word;
  if (!VOWELS.test(letters) || ROMAN.test(letters)) return word;
  return capitalize(word);
}

function fromMixed(word: string): string {
  // Bat dau bang chu thuong va khong co chu hoa nao khac -> viet hoa chu dau.
  const first = word.match(/\p{L}/u)?.[0];
  if (!first || first !== first.toLocaleLowerCase('vi') || first === first.toLocaleUpperCase('vi'))
    return word;
  if (/\p{Lu}/u.test(word)) return word; // "eBay", "iPhone": co y viet nhu vay
  // Tu khong nguyen am go thuong ("tnhh", "mtv") la viet tat -> viet hoa ca tu.
  if (!VOWELS.test(word.replace(/[^\p{L}]/gu, ''))) return word.toLocaleUpperCase('vi');
  return word.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase('vi'));
}

export function normalizeOrgName(value: string): string {
  const name = value.replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(name)) return name;
  const allCaps = !/\p{Ll}/u.test(name);
  // Tach ca tai dau ngoac/gach noi de "(VIỆT NAM)", "SÀI GÒN-HÀ NỘI" cung duoc xu ly.
  return name
    .split(/([\s()\-–/&,"“”]+)/)
    .map((part, i) => (i % 2 === 1 ? part : allCaps ? fromAllCaps(part) : fromMixed(part)))
    .join('');
}
