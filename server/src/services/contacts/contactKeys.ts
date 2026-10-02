import { fold } from '../../lib/viSearch.ts';

/*
 * Khoa so khop da chuan hoa cho danh ba.
 *
 * Cung mot nguoi hay xuat hien duoi nhieu dang: "0901 234 567", "+84 901.234.567",
 * "84901234567". De tim trung giua danh ba dien thoai va danh ba CRM, moi so deu
 * duoc dua ve MOT dang duy nhat. So Viet Nam ve dang noi dia (0xxxxxxxxx); so nuoc
 * ngoai giu nguyen day chu so kem ma nuoc.
 */

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  let digits = text.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const international = text.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);
  /* +84 / 84 / 0084 + 9-10 chu so -> 0 + so noi dia. */
  if (digits.startsWith('84') && (international || digits.length >= 11) && digits.length <= 12) {
    return `0${digits.slice(2)}`;
  }
  return international ? `+${digits}` : digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

/** Mot o co the chua nhieu so/email ("0901..., 0902... / 0903..."). */
export function splitMulti(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;/\n]|\s{2,}|\s:::\s/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface ContactKey {
  kind: 'phone' | 'email';
  value: string;
}

export function keysOf(phones: string[], emails: string[]): ContactKey[] {
  const seen = new Set<string>();
  const keys: ContactKey[] = [];
  const add = (kind: ContactKey['kind'], value: string | null) => {
    if (!value) return;
    const id = `${kind}:${value}`;
    if (seen.has(id)) return;
    seen.add(id);
    keys.push({ kind, value });
  };
  for (const phone of phones) add('phone', normalizePhone(phone));
  for (const email of emails) add('email', normalizeEmail(email));
  return keys;
}

export function searchTextOf(parts: (string | null | undefined)[]): string {
  return fold(parts.filter(Boolean).join(' '));
}
