import { useState } from 'react';

export interface FieldIssue {
  /** id cua o nhap — phai trung id truyen vao control ben trong `Field`. */
  id: string;
  /** Nhan hien trong bang tom tat, bam vao se nhay toi o do. */
  label: string;
}

/**
 * Trang thai loi dung chung cho cac form tu ve (du an khong dung thu vien form).
 *
 * Truoc day moi form deu `disabled={invalid}` tren nut Luu. Nguoi dung bam
 * khong thay gi xay ra, khong biet minh thieu gi — va vi nut bi khoa nen co
 * `submitted` khong bao gio bat len duoc, khien toan bo thong bao loi inline
 * duoi tung o tro thanh code chet.
 *
 * Cach dung: luon de nut Luu bam duoc, goi `validate(issues)` trong onSubmit.
 * Khi thieu, ham tra false, bat co `submitted` cho cac `Field` hien loi inline,
 * va dua focus ve o dau tien bi loi.
 */
export function useFormErrors() {
  const [submitted, setSubmitted] = useState(false);

  const validate = (issues: FieldIssue[]): boolean => {
    setSubmitted(true);
    if (issues.length === 0) return true;
    // Doi React ve xong roi moi focus: luc do o nhap da co aria-invalid nen
    // trinh doc man hinh doc kem ca trang thai loi chu khong chi ten truong.
    requestAnimationFrame(() => document.getElementById(issues[0].id)?.focus());
    return false;
  };

  return { submitted, validate, reset: () => setSubmitted(false) };
}
