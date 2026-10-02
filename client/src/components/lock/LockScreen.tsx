import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight, Image as ImageIcon, LogOut, Mail } from 'lucide-react';
import { LOCK_SCENES, useLockStore } from '../../stores/lockStore';
import { useAuthStore } from '../../stores/authStore';
import { formatLunar } from '../../lib/lunar';
import { digitsOnly, LOCK_STATUS_KEY, lockApi } from './lockApi';
import { quoteOfDay, SCENE_INFO, SceneBackdrop } from './scenes';

/*
 * Man khoa / man cho (1.14.0).
 *
 * Man cho de NGHI: chi co gio, ngay (kem am lich) va mot cau nhe nhang — co y
 * khong hien viec, lich hay thong bao nao.
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

function greeting(hour: number): string {
  if (hour < 5) return 'Khuya rồi';
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 13) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

function solarLabel(date: Date): string {
  const weekday = date.toLocaleDateString('vi-VN', { weekday: 'long' });
  const label = `${weekday}, ${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
  return label.charAt(0).toLocaleUpperCase('vi') + label.slice(1);
}

const pad = (value: number) => String(value).padStart(2, '0');

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
  const now = useNow();
  const [phase, setPhase] = useState<'rest' | 'pin'>('rest');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const restRef = useRef<HTMLDivElement>(null);

  const status = useQuery({ queryKey: LOCK_STATUS_KEY, queryFn: lockApi.status });
  const hasPin = status.data?.has_pin ?? true;

  useEffect(() => {
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, []);

  /* O lai man nhap ma qua lau ma khong go gi thi tro ve man nghi. */
  useEffect(() => {
    if (phase !== 'pin') return;
    const id = window.setTimeout(() => {
      setPhase('rest');
      setPin('');
      setError(null);
      setForgotOpen(false);
    }, 45_000);
    return () => window.clearTimeout(id);
  }, [phase, pin]);

  useEffect(() => {
    if (phase === 'pin') inputRef.current?.focus();
    else restRef.current?.focus();
  }, [phase]);

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

  /* Bat dau mo khoa: chua dat ma thi mo luon, co ma thi hien o nhap. */
  const wake = (firstDigit?: string) => {
    if (status.isSuccess && !status.data.has_pin) {
      unlock();
      return;
    }
    setPhase('pin');
    setError(null);
    if (firstDigit) setPin(firstDigit);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (phase === 'pin') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setPhase('rest');
          setPin('');
          setForgotOpen(false);
        }
        return;
      }
      if (event.key === 'Tab' || event.key === 'Shift') return;
      if (event.target instanceof HTMLButtonElement && event.key === 'Enter') return;
      event.preventDefault();
      wake(/^\d$/.test(event.key) ? event.key : undefined);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pin.length < 4 || verify.isPending) return;
    verify.mutate(pin);
  };

  const nextScene = () => {
    const index = LOCK_SCENES.indexOf(prefs.scene);
    setPrefs({ scene: LOCK_SCENES[(index + 1) % LOCK_SCENES.length] });
  };

  const firstName = (user?.full_name ?? '').trim().split(/\s+/).pop() ?? '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Màn hình đang khóa"
      className="ls-fade-in fixed inset-0 z-lock-screen select-none"
    >
      <SceneBackdrop scene={prefs.scene} />

      <div
        ref={restRef}
        tabIndex={-1}
        onClick={() => phase === 'rest' && wake()}
        className="ls-ink relative flex h-full flex-col items-center justify-center px-4 text-center outline-none"
      >
        <p className="text-base font-medium opacity-90 sm:text-lg">
          {greeting(now.getHours())}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <p
          className="mt-2 font-light tabular-nums leading-none"
          style={{ fontSize: 'clamp(4.5rem, 16vw, 10rem)' }}
          aria-live="off"
        >
          {pad(now.getHours())}:{pad(now.getMinutes())}
          {prefs.showSeconds && (
            <span className="ml-2 align-top text-[0.35em] opacity-70">{pad(now.getSeconds())}</span>
          )}
        </p>
        <p className="mt-4 text-lg font-medium sm:text-xl">{solarLabel(now)}</p>
        {prefs.showLunar && (
          <p className="mt-1 text-sm opacity-85 sm:text-base">Âm lịch: {formatLunar(now)}</p>
        )}
        {prefs.showQuote && phase === 'rest' && (
          <p className="mt-10 max-w-md text-sm italic opacity-85 sm:text-base">{quoteOfDay(now)}</p>
        )}

        {phase === 'rest' ? (
          <p className="absolute bottom-10 text-sm opacity-75">
            {hasPin ? 'Bấm hoặc gõ phím bất kỳ để mở khóa' : 'Bấm hoặc gõ phím bất kỳ để tiếp tục'}
          </p>
        ) : (
          <form
            onSubmit={submit}
            onClick={(event) => event.stopPropagation()}
            className={`mt-10 flex w-full max-w-xs flex-col items-center gap-3 ${shake ? 'ls-shake' : ''}`}
          >
            <label htmlFor="lock-pin" className="text-sm opacity-90">
              Nhập mã mở khóa
            </label>
            <div className="flex w-full gap-2">
              <input
                ref={inputRef}
                id="lock-pin"
                type="password"
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
                placeholder="••••"
                className="ls-glass h-12 min-w-0 flex-1 rounded-full px-5 text-center text-xl tracking-[0.5em] outline-none"
              />
              <button
                type="submit"
                aria-label="Mở khóa"
                disabled={pin.length < 4 || verify.isPending}
                className="ls-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
              >
                <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>
            <p id="lock-pin-error" role="alert" className="min-h-5 text-sm font-medium">
              {error}
            </p>

            {!forgotOpen ? (
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm underline underline-offset-4 opacity-85 hover:opacity-100"
              >
                Quên mã?
              </button>
            ) : (
              <div className="ls-glass w-full rounded-panel p-3 text-sm">
                {sendPin.isSuccess ? (
                  <p role="status">Đã gửi mã tới {sendPin.data.sent_to}. Kiểm tra hộp thư nhé.</p>
                ) : status.data?.can_email ? (
                  <>
                    <p>Gửi lại mã hiện tại vào email tài khoản (mã không đổi).</p>
                    <button
                      type="button"
                      onClick={() => sendPin.mutate()}
                      disabled={sendPin.isPending}
                      className="ls-glass mt-2 inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium disabled:opacity-60"
                    >
                      <Mail size={15} aria-hidden="true" />
                      {sendPin.isPending ? 'Đang gửi…' : 'Gửi mã qua email'}
                    </button>
                  </>
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
        )}
      </div>

      <div className="ls-ink absolute right-4 bottom-4 flex gap-2">
        <button
          type="button"
          onClick={nextScene}
          title={`Đổi cảnh — đang là ${SCENE_INFO[prefs.scene].label}`}
          aria-label={`Đổi cảnh màn chờ, đang là ${SCENE_INFO[prefs.scene].label}`}
          className="ls-glass flex h-10 w-10 items-center justify-center rounded-full"
        >
          <ImageIcon size={17} aria-hidden="true" />
        </button>
        {phase === 'pin' && (
          <button
            type="button"
            onClick={() => void logout()}
            className="ls-glass flex h-10 items-center gap-2 rounded-full px-4 text-sm"
          >
            <LogOut size={15} aria-hidden="true" />
            Đăng xuất
          </button>
        )}
      </div>
    </div>
  );
}
