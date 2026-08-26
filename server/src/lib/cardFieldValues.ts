import { HttpError } from './validate.ts';

/** options luu duoi dang chuoi JSON — luon tra ve mang, du lieu hong thi coi nhu rong. */
export function parseFieldOptions(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Gia tri chuoi ghi cho mot truong tuy chinh co khop field_type/options khong. */
export function isValidFieldValue(fieldType: string, optionsJson: unknown, value: string): boolean {
  if (fieldType === 'number') return value.trim() !== '' && Number.isFinite(Number(value));
  if (fieldType === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (fieldType === 'select') return parseFieldOptions(optionsJson).includes(value);
  if (fieldType === 'checkbox') return value === '0' || value === '1';
  return true; // 'text' — chuoi bat ky
}

/** Nem 400 neu gia tri khong hop le cho field_type/options hien tai. */
export function assertValidFieldValue(
  fieldType: string,
  optionsJson: unknown,
  value: string
): void {
  if (!isValidFieldValue(fieldType, optionsJson, value)) {
    throw new HttpError(400, 'Gia tri khong hop le cho kieu truong nay', {
      code: 'FIELD_VALUE_INVALID',
    });
  }
}
