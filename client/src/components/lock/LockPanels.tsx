import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { canChiYear, toLunar } from '../../lib/lunar';
import { chime } from './ambient';

/*
 * Bang Dem nguoc va Lich am/duong cua man cho (Nhac study o MusicPanel.tsx).
 * Tu ve chu khong dung Popover chung: luc khoa #root bi `inert` va Popover cua app
 * nam duoi tang man khoa.
 */

/* ---------- Dem nguoc ---------- */

const PRESETS = [5, 15, 25, 50];

export interface Countdown {
  /** Tong so giay da dat (0 = chua dat). */
  total: number;
  remaining: number;
  running: boolean;
  finished: boolean;
  start: (minutes: number) => void;
  toggle: () => void;
  reset: () => void;
}

/** Dem theo moc thoi gian that (khong cong don tung giay) de tab an van dem dung. */
export function useCountdown(): Countdown {
  const [total, setTotal] = useState(0);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (endAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endAt]);

  const remaining = endAt === null ? pausedLeft : Math.max(0, Math.ceil((endAt - now) / 1000));

  useEffect(() => {
    if (endAt !== null && remaining === 0) {
      setEndAt(null);
      setPausedLeft(0);
      setFinished(true);
      chime();
    }
  }, [endAt, remaining]);

  return {
    total,
    remaining,
    running: endAt !== null,
    finished,
    start: (minutes) => {
      setTotal(minutes * 60);
      setFinished(false);
      setNow(Date.now());
      setEndAt(Date.now() + minutes * 60_000);
    },
    toggle: () => {
      if (endAt !== null) {
        setPausedLeft(remaining);
        setEndAt(null);
      } else if (pausedLeft > 0) {
        setNow(Date.now());
        setEndAt(Date.now() + pausedLeft * 1000);
      }
    },
    reset: () => {
      setTotal(0);
      setEndAt(null);
      setPausedLeft(0);
      setFinished(false);
    },
  };
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CountdownPanel({ timer }: { timer: Countdown }) {
  const [custom, setCustom] = useState('');
  const active = timer.running || timer.remaining > 0;
  return (
    <div>
      <p className="ls-panel-title">Đếm ngược</p>
      {active || timer.finished ? (
        <div className="mt-2 text-center">
          <p className="text-5xl font-light tabular-nums" aria-live="polite">
            {timer.finished ? 'Hết giờ' : formatClock(timer.remaining)}
          </p>
          {timer.total > 0 && !timer.finished && (
            <div className="ls-progress mt-3" aria-hidden="true">
              <span style={{ width: `${(1 - timer.remaining / timer.total) * 100}%` }} />
            </div>
          )}
          <div className="mt-4 flex justify-center gap-2">
            {!timer.finished && (
              <button type="button" onClick={timer.toggle} className="ls-chip">
                {timer.running ? (
                  <Pause size={15} aria-hidden="true" />
                ) : (
                  <Play size={15} aria-hidden="true" />
                )}
                {timer.running ? 'Tạm dừng' : 'Tiếp tục'}
              </button>
            )}
            <button type="button" onClick={timer.reset} className="ls-chip">
              <RotateCcw size={15} aria-hidden="true" />
              {timer.finished ? 'Đặt lại' : 'Hủy'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => timer.start(minutes)}
                className="ls-chip justify-center px-1.5"
              >
                {minutes} phút
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const minutes = Number(custom);
              if (minutes > 0 && minutes <= 600) timer.start(minutes);
            }}
          >
            <input
              type="number"
              min={1}
              max={600}
              inputMode="numeric"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder="Số phút khác"
              aria-label="Số phút đếm ngược"
              className="ls-field h-10 min-w-0 flex-1 px-3"
            />
            <button type="submit" className="ls-chip">
              <Play size={15} aria-hidden="true" />
              Bắt đầu
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/* ---------- Lich am / duong ---------- */

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export function CalendarPanel({ today }: { today: Date }) {
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - offset + i);
      return { date, lunar: toLunar(date) };
    });
  }, [cursor]);
  const lastRowUsed = cells.slice(35).some((cell) => cell.date.getMonth() === cursor.getMonth());
  const visible = lastRowUsed ? cells : cells.slice(0, 35);
  const todayLunar = toLunar(today);
  const move = (delta: number) =>
    setCursor((value) => new Date(value.getFullYear(), value.getMonth() + delta, 1));

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Tháng trước"
          className="ls-icon-btn"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p className="ls-panel-title">
          Tháng {cursor.getMonth() + 1}, {cursor.getFullYear()}
        </p>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Tháng sau"
          className="ls-icon-btn"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center" role="grid">
        {WEEKDAYS.map((day) => (
          <span key={day} role="columnheader" className="text-xs font-medium opacity-70">
            {day}
          </span>
        ))}
        {visible.map(({ date, lunar }) => {
          const inMonth = date.getMonth() === cursor.getMonth();
          const isToday = date.toDateString() === today.toDateString();
          const firstLunar = lunar.day === 1;
          return (
            <span
              key={date.toISOString()}
              role="gridcell"
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${date.getDate()}/${date.getMonth() + 1}, âm lịch ${lunar.day}/${lunar.month}`}
              className={`ls-day ${inMonth ? '' : 'opacity-35'} ${isToday ? 'ls-day-today' : ''}`}
            >
              <span className="block text-sm font-medium">{date.getDate()}</span>
              <span className={`block text-[10px] ${firstLunar ? 'font-semibold' : 'opacity-70'}`}>
                {firstLunar ? `${lunar.day}/${lunar.month}` : lunar.day}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs opacity-80">
        Hôm nay: {todayLunar.day}/{todayLunar.month}
        {todayLunar.leap ? ' nhuận' : ''} năm {canChiYear(todayLunar.year)}
      </p>
    </div>
  );
}
