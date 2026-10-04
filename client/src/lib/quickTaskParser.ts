import { addDays, addMinutes, format, getDay, startOfDay } from 'date-fns';

/**
 * Hieu mot dong viec go nhanh bang tieng Viet (1.17.0): "mai 9h gọi anh Nam",
 * "chiều thứ 6 gửi báo giá", "30 phút nữa uống thuốc", "15/10 họp giao ban".
 *
 * Tra ve tieu de (da bo phan ngay gio) va thoi diem nhac. Khong dung AI: phai
 * tuc thi khi go va cho ket qua doan truoc duoc — nguoi dung thay ngay ban xem
 * truoc va bo phan hieu sai bang mot cu bam.
 *
 * Go co dau hay khong dau deu duoc. Cac tu de nham khi bo dau ("mốt"/"một",
 * "thứ"/"thư", "tối"/"tôi") chi nhan khi go dung dau, hoac khi ca cau khong dau.
 */
export interface QuickTaskParse {
  /** Tieu de sau khi bo phan ngay gio; rong neu dong chi co ngay gio. */
  title: string;
  /** Thoi diem nhac 'YYYY-MM-DDTHH:mm', null khi khong hieu duoc gio nhac. */
  remindAt: string | null;
  /** Han chot 'YYYY-MM-DD' — ngay cua lan nhac, hoac ngay neu chi co ngay ma khong gio. */
  dueDate: string | null;
  /** Doan chu da duoc hieu la ngay gio (de to sang trong ban xem truoc). */
  matched: string[];
}

interface Span {
  start: number;
  end: number;
}

const DEFAULT_HOUR = 9;
const PERIOD_DEFAULT: Record<Period, number> = { sang: 9, trua: 12, chieu: 14, toi: 20, dem: 22 };
type Period = 'sang' | 'trua' | 'chieu' | 'toi' | 'dem';

const WEEKDAY_WORDS: Record<string, number> = {
  '2': 1,
  hai: 1,
  '3': 2,
  ba: 2,
  '4': 3,
  tu: 3,
  '5': 4,
  nam: 4,
  '6': 5,
  sau: 5,
  '7': 6,
  bay: 6,
};

/**
 * Bo dau TUNG KY TU, giu nguyen do dai — vi tri tim duoc tren ban khong dau
 * dung luon cho chuoi goc khi cat phan ngay gio ra khoi tieu de.
 */
function fold(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const base = ch === 'đ' ? 'd' : ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 ? base : ch;
  }
  return out;
}

const hasDiacritics = (text: string) => fold(text) !== text.toLowerCase();

const pad = (n: number) => String(n).padStart(2, '0');

export function parseQuickTask(input: string, now: Date = new Date()): QuickTaskParse {
  const text = input;
  const folded = fold(text);
  const accented = hasDiacritics(text);
  const spans: Span[] = [];
  /** Cau co dau thi tu de nham phai go dung dau moi tinh. */
  const accentOk = (start: number, end: number, expected: string) =>
    !accented || text.slice(start, end).toLowerCase().startsWith(expected);
  const free = (start: number, end: number) => spans.every((s) => end <= s.start || start >= s.end);
  const take = (start: number, end: number) => {
    if (!free(start, end)) return false;
    spans.push({ start, end });
    return true;
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (const m of folded.matchAll(re)) fn(m as RegExpExecArray);
  };

  /* Gom vao mot doi tuong: gan trong callback thi TS khong thu hep kieu sai. */
  const st: {
    exact: Date | null; // "30 phut nua" — da co ca ngay lan gio
    day: Date | null;
    hour: number | null;
    minute: number;
    period: Period | null;
    explicitToday: boolean;
    /** Thu trong tuan roi dung vao hom nay — gio da qua thi la tuan sau. */
    weekdayToday: boolean;
  } = {
    exact: null,
    day: null,
    hour: null,
    minute: 0,
    period: null,
    explicitToday: false,
    weekdayToday: false,
  };

  // 1. Tuong doi: "30 phut nua", "sau 2 tieng", "3 ngay nua".
  each(
    /\b(?:sau\s+(\d{1,3})\s*(phut|tieng|gio|ngay)|(\d{1,3})\s*(phut|tieng|gio|ngay)\s+nua)\b/g,
    (m) => {
      if (st.exact || !take(m.index, m.index + m[0].length)) return;
      const n = Number(m[1] ?? m[3]);
      const unit = m[2] ?? m[4];
      if (unit === 'ngay') st.day = addDays(startOfDay(now), n);
      else st.exact = addMinutes(now, unit === 'phut' ? n : n * 60);
    }
  );

  // 2. Thu trong tuan: "thu 6", "thứ sáu", "t6", "chu nhat", kem "tuan sau/toi".
  //    Khong nhan "CN": hay la viet tat (chi nhanh, cong nghe).
  each(
    /\b(?:thu\s*(2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)|t([2-7])|chu nhat)(\s+tuan\s+(?:sau|toi))?\b/g,
    (m) => {
      if (st.day) return;
      const start = m.index;
      const isThu = m[0].startsWith('thu');
      if (isThu && !accentOk(start, start + 3, 'thứ')) return;
      if (!take(start, start + m[0].length)) return;
      const target = m[1] ? WEEKDAY_WORDS[m[1]] : m[2] ? Number(m[2]) - 1 : 0;
      const today = getDay(now); // 0 = CN
      if (m[3]) {
        // Tuan sau: tinh tu thu Hai cua tuan sau.
        const monday = addDays(startOfDay(now), (8 - today) % 7 || 7);
        st.day = addDays(monday, (target + 6) % 7);
      } else {
        const ahead = (target - today + 7) % 7;
        st.weekdayToday = ahead === 0;
        st.day = addDays(startOfDay(now), ahead);
      }
    }
  );

  // 3. Ngay tuyet doi: "15/10", "15/10/2026".
  each(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?\b/g, (m) => {
    if (st.day) return;
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    const candidate = new Date(y, mo - 1, d);
    if (candidate.getMonth() !== mo - 1 || candidate.getDate() !== d) return;
    if (!take(m.index, m.index + m[0].length)) return;
    // Khong ghi nam ma ngay da qua thi la nam sau.
    st.day = !m[3] && candidate < startOfDay(now) ? new Date(y + 1, mo - 1, d) : candidate;
  });

  // 4. Tu chi ngay: "hom nay", "ngay mai", "mai", "ngay mot", "mot", "ngay kia".
  each(/\b(hom nay|ngay mai|mai|ngay mot|mot|ngay kia)\b/g, (m) => {
    if (st.day) return;
    const word = m[1];
    const start = m.index;
    const end = start + m[0].length;
    if (word.endsWith('mot') && !accentOk(end - 3, end, 'mốt')) return;
    if (!take(start, end)) return;
    const offset = word === 'hom nay' ? 0 : word.endsWith('mai') ? 1 : 2;
    if (offset === 0) st.explicitToday = true;
    st.day = addDays(startOfDay(now), offset);
  });

  // 5. Gio: "9h", "9h30", "9:30", "9 gio 30", "lúc 14h".
  each(/\b(?:luc\s+)?(\d{1,2})\s*(?:h|g|gio|:)\s*(\d{2})?(?:\s*phut)?(?![\w/])/g, (m) => {
    if (st.hour !== null || st.exact) return;
    const h = Number(m[1]);
    const mi = m[2] ? Number(m[2]) : 0;
    if (h > 23 || mi > 59) return;
    if (!take(m.index, m.index + m[0].length)) return;
    st.hour = h;
    st.minute = mi;
  });

  // 6. Buoi: chi nhan khi dung sat mot cum ngay gio ("9h toi", "chieu mai",
  //    "toi nay") — dung mot minh thi "toi" de la "tôi".
  each(/\b(sang|trua|chieu|toi|dem)(\s+nay)?\b/g, (m) => {
    if (st.period || st.exact) return;
    const start = m.index;
    const end = start + m[0].length;
    const word = m[1] as Period;
    const adjacent =
      !!m[2] ||
      spans.some(
        (s) => /^\s*$/.test(folded.slice(s.end, start)) || /^\s*$/.test(folded.slice(end, s.start))
      );
    if (!adjacent) return;
    if (word === 'toi' && !accentOk(start, start + 3, 'tối')) return;
    if (!take(start, end)) return;
    st.period = word;
    if (m[2] && !st.day) {
      st.explicitToday = true;
      st.day = startOfDay(now);
    }
  });

  let remindAt: Date | null = st.exact;
  if (!remindAt && (st.hour !== null || st.period)) {
    let h = st.hour ?? PERIOD_DEFAULT[st.period as Period];
    if (st.hour !== null) {
      if (st.period === 'trua' && h < 6) h += 12;
      else if ((st.period === 'chieu' || st.period === 'toi') && h < 12) h += 12;
      else if (st.period === 'dem' && h >= 9 && h < 12) h += 12;
      else if (!st.period && h >= 1 && h <= 6) h += 12; // "3h goi khach" = 15h
    }
    const base = st.day ?? startOfDay(now);
    remindAt = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
      h,
      st.hour !== null ? st.minute : 0
    );
    // Chi co gio ma gio da qua hom nay: hieu la ngay mai.
    if (!st.day && remindAt <= now) remindAt = addDays(remindAt, 1);
  } else if (!remindAt && st.day && !st.explicitToday) {
    remindAt = new Date(st.day.getFullYear(), st.day.getMonth(), st.day.getDate(), DEFAULT_HOUR, 0);
  }
  // "hom nay" khong gio: chi dat han, khong nhac (khong biet nhac luc nao).
  if (remindAt && remindAt <= now && st.weekdayToday) remindAt = addDays(remindAt, 7);
  if (remindAt && remindAt <= now && !st.exact) remindAt = null;

  const dueDay = remindAt ?? st.day;
  spans.sort((a, b) => a.start - b.start);
  let title = '';
  let cursor = 0;
  for (const s of spans) {
    title += `${text.slice(cursor, s.start)} `;
    cursor = s.end;
  }
  title += text.slice(cursor);
  title = title
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '')
    .trim();
  if (title) title = title[0].toUpperCase() + title.slice(1);

  return {
    title,
    remindAt: remindAt ? format(remindAt, "yyyy-MM-dd'T'HH:mm") : null,
    dueDate: dueDay ? format(dueDay, 'yyyy-MM-dd') : null,
    matched: spans.map((s) => text.slice(s.start, s.end).trim()),
  };
}

/** Nhan ngan cho ban xem truoc: "Hôm nay 15:00", "Mai 09:00", "T6 10/10 14:00". */
export function describeWhen(value: string, now: Date = new Date()): string {
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diff = Math.round((target.getTime() - startOfDay(now).getTime()) / 86_400_000);
  const dayLabel =
    diff === 0
      ? 'Hôm nay'
      : diff === 1
        ? 'Mai'
        : `${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][target.getDay()]} ${pad(d)}/${pad(m)}`;
  return timePart ? `${dayLabel} ${timePart}` : dayLabel;
}
