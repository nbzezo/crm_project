import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  Eye,
  EyeOff,
  Headphones,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Timer,
} from 'lucide-react';
import { LOCK_SCENES, useLockStore } from '../../stores/lockStore';
import { useAuthStore } from '../../stores/authStore';
import { formatLunar } from '../../lib/lunar';
import { t } from '../../i18n/vi';
import { digitsOnly, LOCK_STATUS_KEY, lockApi } from './lockApi';
import { headlineOfDay, quoteOfDay, SCENE_INFO, SceneBackdrop, useLockPhoto } from './scenes';
import { AMBIENT_INFO, stopAmbient, type AmbientKind } from './ambient';
import type { MusicLink } from '../../lib/musicLinks';
import { CalendarPanel, CountdownPanel, formatClock, useCountdown } from './LockPanels';
import { MusicPanel } from './MusicPanel';

/*
 * Man khoa / man cho (1.14.0).
 *
 * Bo cuc: ten app goc trai tren; dong ho, ngay va the "Chao mung tro lai" ben
 * phai; thanh cong cu (Dem nguoc · Nhac study · Lich am/duong) giua mep duoi.
 *
 * Man cho de NGHI: co y khong hien viec, lich hen hay thong bao nao.
 *
 * Phu len tren ung dung chu khong thay the no: form dang go do, cuoc tro chuyen
 * dang mo... van nguyen khi mo khoa. Trong luc khoa, #root bi `inert` de Tab
 * khong lot xuong ben duoi.
 */

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function solarLabel(date: Date): string {
  const weekday = date.toLocaleDateString('vi-VN', { weekday: 'long' });
  const label = `${weekday}, ${String(date.getDate()).padStart(2, '0')} tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
  return label.charAt(0).toLocaleUpperCase('vi') + label.slice(1);
}

const pad = (value: number) => String(value).padStart(2, '0');

type Panel = 'timer' | 'music' | 'calendar';

export function LockScreen() {
  const locked = useLockStore((s) => s.locked);
  if (!locked) return null;
  return createPortal(<LockOverlay />, document.body);
}

function LockOverlay() {
  const unlock = useLockStore((s) => s.unlock);
  const prefs = useLockStore((s) => s.prefs);
  const setPrefs = useLockStore((s) => s.setPrefs);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const photo = useLockPhoto();
  const now = useNow();
  const timer = useCountdown();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [music, setMusic] = useState<AmbientKind | null>(null);
  const [musicLink, setMusicLink] = useState<MusicLink | null>(null);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const inputRef = useRef<HTMLInputElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);

  const status = useQuery({ queryKey: LOCK_STATUS_KEY, queryFn: lockApi.status });
  const hasPin = status.data?.has_pin ?? true;

  useEffect(() => {
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      root?.removeAttribute('inert');
      document.removeEventListener('fullscreenchange', onFullscreen);
      /* Mo khoa (hoac dang xuat) thi tat nhac va thoat toan man hinh. */
      stopAmbient();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (status.isPending) return;
    if (hasPin) inputRef.current?.focus();
    else enterRef.current?.focus();
  }, [hasPin, status.isPending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel) {
        event.preventDefault();
        setPanel(null);
        return;
      }
      /* Go so o bat ky dau (khong dang o o nhap nao) thi dua vao o ma. */
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (!typing && hasPin && /^\d$/.test(event.key)) {
        event.preventDefault();
        setPin((value) => digitsOnly(value + event.key));
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, hasPin]);

  const verify = useMutation({
    mutationFn: (value: string) => lockApi.verify(value),
    onSuccess: (result) => {
      if (result.ok) {
        unlock();
        return;
      }
      setPin('');
      setError('Mã không đúng');
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
    },
    onError: (err) => {
      setPin('');
      setError(err instanceof Error ? err.message : 'Không kiểm tra được mã, thử lại sau');
    },
  });

  const sendPin = useMutation({ mutationFn: lockApi.sendPin });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (status.isSuccess && !status.data.has_pin) {
      unlock();
      return;
    }
    if (pin.length < 4) {
      setError('Mã gồm 4 đến 6 chữ số');
      inputRef.current?.focus();
      return;
    }
    if (!verify.isPending) verify.mutate(pin);
  };

  const nextScene = () => {
    const order = photo ? (['photo', ...LOCK_SCENES] as const) : LOCK_SCENES;
    const index = order.indexOf(prefs.scene);
    setPrefs({ scene: order[(index + 1) % order.length] });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const firstName = (user?.full_name ?? '').trim().split(/\s+/).pop() ?? '';
  const [line1, line2] = headlineOfDay(now);
  const tags = [user?.positions?.[0]?.name, user?.org_unit?.name, t.app.name].filter(Boolean);
  const timerActive = timer.running || timer.remaining > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Màn hình đang khóa"
      className="ls-fade-in ls-root fixed inset-0 z-lock-screen overflow-y-auto"
    >
      <SceneBackdrop scene={prefs.scene} />
      <div className="ls-vignette" aria-hidden="true" />

      <div className="ls-ink relative flex min-h-full flex-col px-5 py-5 sm:px-10 sm:py-8">
        {/* Hang tren: ten app + nut man hinh */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold sm:text-3xl">{t.app.name}</p>
            <p className="ls-spaced mt-1 text-xs sm:text-sm">Không gian của bạn</p>
          </div>
          <div className="flex gap-2">
            <RoundButton
              label={`Đổi cảnh — đang là ${SCENE_INFO[prefs.scene].label}`}
              onClick={nextScene}
            >
              <ImageIcon size={18} aria-hidden="true" />
            </RoundButton>
            {document.fullscreenEnabled && (
              <RoundButton
                label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                onClick={toggleFullscreen}
              >
                {fullscreen ? (
                  <Minimize2 size={18} aria-hidden="true" />
                ) : (
                  <Maximize2 size={18} aria-hidden="true" />
                )}
              </RoundButton>
            )}
          </div>
        </header>

        {/* Cot phai: dong ho + the chao */}
        <main className="flex flex-1 items-center justify-center py-6 md:justify-end md:pr-[4%]">
          <div className="flex w-full max-w-md flex-col items-center">
            <p
              className="font-light tabular-nums leading-none"
              style={{ fontSize: 'clamp(3.75rem, 9vw, 6.5rem)' }}
            >
              {pad(now.getHours())}:{pad(now.getMinutes())}
              {prefs.showSeconds && `:${pad(now.getSeconds())}`}
            </p>
            <p className="mt-3 text-sm sm:text-base">{solarLabel(now)}</p>
            {prefs.showLunar && (
              <p className="mt-1 text-xs opacity-85 sm:text-sm">Âm lịch: {formatLunar(now)}</p>
            )}

            <form
              onSubmit={submit}
              className={`ls-card mt-8 w-full p-6 sm:p-8 ${shake ? 'ls-shake' : ''}`}
            >
              <p className="ls-eyebrow">Chào mừng trở lại{firstName ? `, ${firstName}` : ''}</p>
              <p className="mt-3 text-2xl leading-snug sm:text-[1.75rem]">
                {line1}
                <br />
                {line2}
              </p>

              {hasPin && (
                <>
                  <label htmlFor="lock-pin" className="mt-6 block text-sm font-medium">
                    Mã mở khóa
                  </label>
                  <div className="relative mt-2">
                    <input
                      ref={inputRef}
                      id="lock-pin"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={6}
                      value={pin}
                      onChange={(event) => {
                        setPin(digitsOnly(event.target.value));
                        setError(null);
                      }}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'lock-pin-error' : undefined}
                      placeholder="Nhập mã 4–6 số"
                      className="ls-field h-12 w-full pr-12 pl-4 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((value) => !value)}
                      aria-label={showPin ? 'Ẩn mã' : 'Hiện mã'}
                      aria-pressed={showPin}
                      className="ls-icon-btn absolute top-1/2 right-2 -translate-y-1/2"
                    >
                      {showPin ? (
                        <EyeOff size={17} aria-hidden="true" />
                      ) : (
                        <Eye size={17} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  <p id="lock-pin-error" role="alert" className="mt-2 min-h-5 text-sm font-medium">
                    {error}
                  </p>
                </>
              )}

              <button
                ref={enterRef}
                type="submit"
                disabled={verify.isPending}
                className={`ls-primary h-12 w-full ${hasPin ? 'mt-1' : 'mt-6'}`}
              >
                {verify.isPending ? 'Đang kiểm tra…' : 'Vào không gian làm việc'}
              </button>

              <div className="mt-4 flex items-center justify-between text-sm">
                {hasPin ? (
                  <button
                    type="button"
                    onClick={() => setForgotOpen((value) => !value)}
                    aria-expanded={forgotOpen}
                    className="underline-offset-4 opacity-85 hover:underline hover:opacity-100"
                  >
                    Quên mã?
                  </button>
                ) : (
                  <span className="opacity-75">Chưa đặt mã — bấm để vào</span>
                )}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="underline-offset-4 opacity-85 hover:underline hover:opacity-100"
                >
                  Đăng xuất
                </button>
              </div>

              {forgotOpen && hasPin && (
                <div className="ls-note mt-3 p-3 text-sm">
                  {sendPin.isSuccess ? (
                    <p role="status">Đã gửi mã tới {sendPin.data.sent_to}. Kiểm tra hộp thư nhé.</p>
                  ) : status.data?.can_email ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>Gửi lại mã hiện tại vào email (mã không đổi).</span>
                      <button
                        type="button"
                        onClick={() => sendPin.mutate()}
                        disabled={sendPin.isPending}
                        className="ls-chip"
                      >
                        {sendPin.isPending ? 'Đang gửi…' : 'Gửi qua email'}
                      </button>
                    </div>
                  ) : (
                    <p>Máy chủ chưa gửi được email. Hãy đăng xuất rồi đăng nhập lại để vào tiếp.</p>
                  )}
                  {sendPin.error && (
                    <p role="alert" className="mt-2 font-medium">
                      {sendPin.error instanceof Error ? sendPin.error.message : 'Không gửi được'}
                    </p>
                  )}
                </div>
              )}
            </form>
          </div>
        </main>

        {/* Hang duoi: cau nhan + nhan ben trai, thanh cong cu o giua */}
        <footer className="relative flex flex-col items-center gap-4 md:block md:min-h-16">
          <div className="hidden max-w-sm md:absolute md:bottom-1 md:left-0 md:block">
            {prefs.showQuote && <p className="mb-2 text-sm italic opacity-85">{quoteOfDay(now)}</p>}
            <p className="ls-spaced text-xs">{tags.join(' · ')}</p>
          </div>

          <div className="relative md:mx-auto md:w-fit">
            {/* Luon gan (an bang `hidden`), vi nhac tu link van phai chay khi dong bang. */}
            <div
              hidden={!panel}
              className="ls-panel absolute bottom-full left-1/2 mb-3 max-h-[70vh] w-[min(22rem,calc(100vw-2.5rem))] -translate-x-1/2 overflow-y-auto p-4"
              role="region"
              aria-label={
                panel === 'timer' ? 'Đếm ngược' : panel === 'music' ? 'Nhạc study' : 'Lịch âm dương'
              }
            >
              {panel === 'timer' && <CountdownPanel timer={timer} />}
              <div hidden={panel !== 'music'}>
                <MusicPanel
                  ambient={music}
                  onAmbient={setMusic}
                  link={musicLink}
                  onLink={setMusicLink}
                />
              </div>
              {panel === 'calendar' && <CalendarPanel today={now} />}
            </div>
            <nav aria-label="Tiện ích màn chờ" className="ls-dock flex gap-1 p-1.5 sm:gap-2 sm:p-2">
              <DockButton
                active={panel === 'timer'}
                onClick={() => setPanel(panel === 'timer' ? null : 'timer')}
                icon={<Timer size={17} aria-hidden="true" />}
                showLabel={timerActive || timer.finished}
              >
                {timerActive
                  ? formatClock(timer.remaining)
                  : timer.finished
                    ? 'Hết giờ'
                    : 'Đếm ngược'}
              </DockButton>
              <DockButton
                active={panel === 'music'}
                onClick={() => setPanel(panel === 'music' ? null : 'music')}
                icon={<Headphones size={17} aria-hidden="true" />}
                showLabel={music !== null || musicLink !== null}
              >
                {musicLink ? musicLink.title : music ? AMBIENT_INFO[music].label : 'Nhạc study'}
              </DockButton>
              <DockButton
                active={panel === 'calendar'}
                onClick={() => setPanel(panel === 'calendar' ? null : 'calendar')}
                icon={<CalendarDays size={17} aria-hidden="true" />}
              >
                Lịch âm / dương
              </DockButton>
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ls-round flex h-11 w-11 items-center justify-center rounded-full"
    >
      {children}
    </button>
  );
}

function DockButton({
  active,
  onClick,
  icon,
  children,
  showLabel = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  /** Dien thoai chi hien icon; nhan van hien khi no mang trang thai (dang dem, dang phat). */
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`ls-dock-btn flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap sm:px-4 ${
        active ? 'ls-dock-btn-on' : ''
      }`}
    >
      {icon}
      <span className={`tabular-nums ${showLabel ? '' : 'max-sm:sr-only'}`}>{children}</span>
    </button>
  );
}
