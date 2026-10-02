import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ImagePlus } from 'lucide-react';
import { Button, Field, FormError, Input, Segmented } from '../common/ui';
import { focusRing } from '../common/ui';
import { useUiStore } from '../../stores/uiStore';
import { IDLE_OPTIONS, LOCK_SCENES, useLockStore, type IdleMinutes } from '../../stores/lockStore';
import { digitsOnly, LOCK_STATUS_KEY, lockApi } from './lockApi';
import { SCENE_INFO, SceneBackdrop, useLockPhoto } from './scenes';
import { removeLockPhoto, saveLockPhoto } from '../../lib/lockPhoto';
import type { LockScene } from '../../stores/lockStore';

/**
 * Khoa man hinh & man cho — mo tu menu tai khoan.
 *
 * Khong nam trong Cai dat: Cai dat la khu quan tri (co phan quyen), con day la
 * so thich cua MOI nguoi.
 */
export function LockSettings({ onPreview }: { onPreview: () => void }) {
  return (
    <div className="space-y-6 p-4">
      <ScenePicker onPreview={onPreview} />
      <AutoLock />
      <PinSection />
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-tr-text">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-tr-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ScenePicker({ onPreview }: { onPreview: () => void }) {
  const prefs = useLockStore((s) => s.prefs);
  const setPrefs = useLockStore((s) => s.setPrefs);
  const pushToast = useUiStore((s) => s.pushToast);
  const photo = useLockPhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const scenes: readonly LockScene[] = photo ? ['photo', ...LOCK_SCENES] : LOCK_SCENES;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setPhotoError(null);
    try {
      await saveLockPhoto(file);
      setPrefs({ scene: 'photo' });
      pushToast('Đã đặt ảnh làm nền màn chờ', 'success');
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Không lưu được ảnh');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removePhoto = () => {
    removeLockPhoto();
    if (prefs.scene === 'photo') setPrefs({ scene: 'aurora' });
  };

  return (
    <Section
      title="Màn chờ"
      hint="Chọn khung cảnh để nghỉ mắt, hoặc dùng ảnh của bạn. Có thể đổi ngay trên màn chờ."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {scenes.map((scene) => {
          const active = prefs.scene === scene;
          return (
            <button
              key={scene}
              type="button"
              aria-pressed={active}
              aria-label={`${SCENE_INFO[scene].label}: ${SCENE_INFO[scene].description}`}
              onClick={() => setPrefs({ scene })}
              className={`group overflow-hidden rounded-panel border text-left transition ${
                active
                  ? 'border-tr-primary ring-2 ring-tr-primary/30'
                  : 'border-tr-border hover:border-tr-primary/40'
              } ${focusRing}`}
            >
              <span className="relative block aspect-video">
                <SceneBackdrop scene={scene} thumb />
                {active && (
                  <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-tr-primary text-tr-on-primary">
                    <Check size={12} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span className="block px-2 py-1.5">
                <span className="block text-sm font-medium text-tr-text">
                  {SCENE_INFO[scene].label}
                </span>
                <span className="block truncate text-xs text-tr-muted">
                  {SCENE_INFO[scene].description}
                </span>
              </span>
            </button>
          );
        })}
        {!photo && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`flex aspect-video flex-col items-center justify-center gap-1 rounded-panel border border-dashed border-tr-border text-sm text-tr-muted transition hover:border-tr-primary/50 hover:text-tr-text sm:aspect-auto ${focusRing}`}
          >
            <ImagePlus size={20} aria-hidden="true" />
            {uploading ? 'Đang xử lý ảnh…' : 'Tải ảnh của bạn'}
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {photo && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImagePlus size={14} aria-hidden="true" />
            {uploading ? 'Đang xử lý ảnh…' : 'Đổi ảnh'}
          </Button>
          <Button size="sm" variant="ghost" onClick={removePhoto}>
            Gỡ ảnh
          </Button>
        </div>
      )}
      {photoError && <FormError error={new Error(photoError)} />}
      <p className="mt-2 text-xs text-tr-muted">
        Ảnh chỉ lưu trên máy này, tự thu nhỏ để nhẹ. Nên chọn ảnh ngang, chủ thể lệch trái để chừa
        chỗ cho đồng hồ bên phải.
      </p>

      <div className="mt-3 space-y-2">
        <Toggle
          label="Hiện giây"
          checked={prefs.showSeconds}
          onChange={(value) => setPrefs({ showSeconds: value })}
        />
        <Toggle
          label="Hiện ngày âm lịch"
          checked={prefs.showLunar}
          onChange={(value) => setPrefs({ showLunar: value })}
        />
        <Toggle
          label="Hiện câu nhắn nhẹ nhàng"
          checked={prefs.showQuote}
          onChange={(value) => setPrefs({ showQuote: value })}
        />
      </div>

      <Button className="mt-3" onClick={onPreview}>
        Khóa ngay để xem thử
      </Button>
    </Section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-tr-text">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--color-tr-primary)]"
      />
      {label}
    </label>
  );
}

function idleLabel(minutes: IdleMinutes): string {
  if (minutes === 0) return 'Tắt';
  if (minutes === 60) return '1 giờ';
  return `${minutes} phút`;
}

function AutoLock() {
  const idleMinutes = useLockStore((s) => s.prefs.idleMinutes);
  const setPrefs = useLockStore((s) => s.setPrefs);
  return (
    <Section
      title="Tự khóa khi không dùng"
      hint="Không chạm chuột, bàn phím trên mọi tab trong khoảng thời gian này thì tự khóa. Phím tắt khóa ngay: Ctrl + Shift + L."
    >
      <Segmented
        label="Tự khóa sau"
        value={String(idleMinutes)}
        onChange={(value) => setPrefs({ idleMinutes: Number(value) as IdleMinutes })}
        options={IDLE_OPTIONS.map((minutes) => ({
          value: String(minutes),
          label: idleLabel(minutes),
        }))}
      />
    </Section>
  );
}

type PinMode = 'view' | 'change' | 'remove';

function PinSection() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const status = useQuery({ queryKey: LOCK_STATUS_KEY, queryFn: lockApi.status });
  const [mode, setMode] = useState<PinMode>('view');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const reset = () => {
    setMode('view');
    setCurrent('');
    setNext('');
    setConfirm('');
    setLocalError(null);
  };

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: LOCK_STATUS_KEY });
    pushToast(message, 'success');
    reset();
  };

  const save = useMutation({
    mutationFn: () => lockApi.setPin(next, status.data?.has_pin ? current : undefined),
    onSuccess: () => done(status.data?.has_pin ? 'Đã đổi mã mở khóa' : 'Đã đặt mã mở khóa'),
  });
  const remove = useMutation({
    mutationFn: () => lockApi.removePin(current),
    onSuccess: () => done('Đã tắt mã mở khóa'),
  });
  const sendPin = useMutation({
    mutationFn: lockApi.sendPin,
    onSuccess: (result) => pushToast(`Đã gửi mã tới ${result.sent_to}`, 'success'),
  });

  const submitSave = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(next)) return setLocalError('Mã gồm 4 đến 6 chữ số');
    if (next !== confirm) return setLocalError('Hai lần nhập mã mới chưa khớp');
    setLocalError(null);
    save.mutate();
  };

  const submitRemove = (event: FormEvent) => {
    event.preventDefault();
    remove.mutate();
  };

  if (status.isPending) return <Section title="Mã mở khóa">{null}</Section>;
  const hasPin = status.data?.has_pin ?? false;

  const pinInput = (label: string, value: string, set: (v: string) => void, auto?: boolean) => (
    <Field label={label} required>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={auto}
        value={value}
        onChange={(event) => set(digitsOnly(event.target.value))}
      />
    </Field>
  );

  return (
    <Section
      title="Mã mở khóa"
      hint={
        hasPin
          ? 'Đang bật. Mã dùng chung trên mọi máy bạn đăng nhập.'
          : 'Chưa đặt mã: bấm hoặc gõ phím bất kỳ là mở khóa. Đặt mã 4–6 số để che màn hình khi rời bàn.'
      }
    >
      <FormError error={localError ? new Error(localError) : (save.error ?? remove.error)} />

      {(!hasPin || mode === 'change') && (
        <form onSubmit={submitSave} className="max-w-xs space-y-3">
          {hasPin && pinInput('Mã hiện tại', current, setCurrent, true)}
          {pinInput(hasPin ? 'Mã mới' : 'Mã mở khóa', next, setNext)}
          {pinInput('Nhập lại mã', confirm, setConfirm)}
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {hasPin ? 'Đổi mã' : 'Đặt mã'}
            </Button>
            {hasPin && <Button onClick={reset}>Hủy</Button>}
          </div>
        </form>
      )}

      {hasPin && mode === 'remove' && (
        <form onSubmit={submitRemove} className="max-w-xs space-y-3">
          {pinInput('Mã hiện tại', current, setCurrent, true)}
          <div className="flex gap-2">
            <Button
              type="submit"
              variant="danger"
              disabled={remove.isPending || current.length < 4}
            >
              Tắt mã
            </Button>
            <Button onClick={reset}>Hủy</Button>
          </div>
        </form>
      )}

      {hasPin && mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setMode('change')}>Đổi mã</Button>
          <Button onClick={() => setMode('remove')}>Tắt mã</Button>
          {status.data?.can_email && (
            <Button variant="ghost" disabled={sendPin.isPending} onClick={() => sendPin.mutate()}>
              {sendPin.isPending ? 'Đang gửi…' : 'Quên mã? Gửi qua email'}
            </Button>
          )}
        </div>
      )}
      {sendPin.error && <FormError error={sendPin.error} />}
    </Section>
  );
}
