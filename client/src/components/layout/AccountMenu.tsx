import { lazy, Suspense, useEffect, useState } from 'react';
import {
  ChevronDown,
  Headphones,
  Lock,
  LogOut,
  MonitorPause,
  Palette,
  Send,
  UserCog,
} from 'lucide-react';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { Modal } from '../common/Modal';
import { focusRing } from '../common/ui';
import { t } from '../../i18n/vi';
import { useAuthStore } from '../../stores/authStore';
import { ThemeOptionItems, useThemeLabel } from './ThemeToggle';
import { useLockStore } from '../../stores/lockStore';
import { useMusicStore } from '../../stores/musicStore';

const AccountSettings = lazy(() =>
  import('../settings/AccountSettings').then((m) => ({ default: m.AccountSettings }))
);
const MyTelegramSettings = lazy(() =>
  import('../settings/MyTelegramSettings').then((m) => ({ default: m.MyTelegramSettings }))
);
const LockSettings = lazy(() =>
  import('../lock/LockSettings').then((m) => ({ default: m.LockSettings }))
);

/**
 * Menu tài khoản trên thanh trên.
 *
 * Trước đây *Tài khoản* là một tab trong Cài đặt, nằm lẫn giữa mười một mục
 * quản trị. Nó là thứ duy nhất trong đó mà **mọi người** đều dùng, nên đặt cạnh
 * chúng là sai nhóm: sau khi chuyển ra đây, Cài đặt trở thành thuần quản trị.
 *
 * Menu hiện luôn **vị trí và đơn vị**. Từ khi có phân quyền, câu hỏi "vì sao tôi
 * không thấy khách hàng này" xuất hiện thường xuyên, và câu trả lời luôn là chỗ
 * ngồi trong cây đơn vị — nên nó phải ở chỗ người ta tìm đầu tiên. Dữ liệu này
 * `GET /api/auth/me` đã trả về sẵn, không tốn thêm request nào.
 */
function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?';
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[words.length - 2][0] + words[words.length - 1][0]).toLocaleUpperCase('vi');
  }
  return source.slice(0, 2).toLocaleUpperCase('vi');
}

export function AccountMenu() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const pop = usePopover();
  const [accountOpen, setAccountOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const lock = useLockStore((s) => s.lock);
  const openMusic = useMusicStore((s) => s.setPanelOpen);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeLabel = useThemeLabel();
  /* Menu dong (chon xong, bam ra ngoai, Esc) thi thu danh sach Giao dien lai —
     neu khong, lan mo sau no da mo san va bam "Giao dien" lai thu no vao. */
  useEffect(() => {
    if (!pop.open) setThemeOpen(false);
  }, [pop.open]);

  const name = user?.full_name ?? user?.username ?? '';
  const email = user?.email ?? null;
  const position = user?.positions?.[0];
  const unit = user?.org_unit?.name;

  return (
    <>
      <button
        type="button"
        onClick={pop.toggle}
        aria-label={t.account.menuLabel}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-tr-hover fine:h-9 fine:w-9 ${focusRing}`}
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-tr-primary/30 bg-tr-primary/15 text-xs font-semibold text-tr-primary fine:h-7 fine:w-7"
        >
          {initials(name, email)}
        </span>
      </button>

      {/* `title` của Popover đã là tên người dùng — không tự vẽ thêm một header
          nữa, sẽ thành hai viền lồng nhau. */}
      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title={name} width={268}>
        <div className="-mt-1 mb-1 border-b border-tr-border px-1 pb-2">
          {email ? <p className="truncate text-xs text-tr-muted">{email}</p> : null}
          {position ? (
            <p className="mt-0.5 truncate text-xs text-tr-subtle">
              {position.name}
              {unit ? ` · ${unit}` : ''}
            </p>
          ) : null}
        </div>

        <PopoverItem
          icon={<UserCog size={15} />}
          onClick={() => {
            pop.close();
            setAccountOpen(true);
          }}
        >
          {t.account.title}
        </PopoverItem>
        {/* Giao dien o day tren MOI co man hinh (1.14.0) — thanh tren nhuong cho cho
            nut Khoa man hinh. */}
        <div>
          <PopoverItem
            icon={<Palette size={15} />}
            expanded={themeOpen}
            onClick={() => setThemeOpen((value) => !value)}
          >
            <span className="flex flex-1 items-center gap-2">
              <span className="flex-1">Giao diện</span>
              <span className="text-xs text-tr-muted">{themeLabel}</span>
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={`transition-transform ${themeOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </PopoverItem>
          {themeOpen && (
            <div className="ms-3 border-s border-tr-border ps-1">
              <ThemeOptionItems onPicked={pop.close} />
            </div>
          )}
        </div>
        <PopoverItem
          icon={<Send size={15} />}
          onClick={() => {
            pop.close();
            setTelegramOpen(true);
          }}
        >
          Telegram của tôi
        </PopoverItem>
        <PopoverItem
          icon={<MonitorPause size={15} />}
          onClick={() => {
            pop.close();
            setLockOpen(true);
          }}
        >
          Khóa màn hình &amp; màn chờ
        </PopoverItem>
        {/* Man rong da co nut Khoa canh chuong va nut Nhac; dien thoai mo tu day. */}
        <div className="md:hidden">
          <PopoverItem
            icon={<Headphones size={15} />}
            onClick={() => {
              pop.close();
              openMusic(true);
            }}
          >
            Nhạc
          </PopoverItem>
          <PopoverItem
            icon={<Lock size={15} />}
            onClick={() => {
              pop.close();
              lock();
            }}
          >
            Khóa ngay
          </PopoverItem>
        </div>
        <PopoverItem
          icon={<LogOut size={15} />}
          danger
          onClick={() => {
            pop.close();
            void logout();
          }}
        >
          {t.auth.signOut}
        </PopoverItem>
      </Popover>

      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title={t.account.title}>
        <Suspense fallback={<p className="p-4 text-sm text-tr-muted">{t.common.loading}</p>}>
          <AccountSettings />
        </Suspense>
      </Modal>

      <Modal open={telegramOpen} onClose={() => setTelegramOpen(false)} title="Telegram của tôi">
        <Suspense fallback={<p className="p-4 text-sm text-tr-muted">{t.common.loading}</p>}>
          <MyTelegramSettings />
        </Suspense>
      </Modal>

      <Modal open={lockOpen} onClose={() => setLockOpen(false)} title="Khóa màn hình & màn chờ">
        <Suspense fallback={<p className="p-4 text-sm text-tr-muted">{t.common.loading}</p>}>
          <LockSettings
            onPreview={() => {
              setLockOpen(false);
              lock();
            }}
          />
        </Suspense>
      </Modal>
    </>
  );
}
