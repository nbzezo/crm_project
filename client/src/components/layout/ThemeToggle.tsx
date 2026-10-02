import { Check, Contrast, Monitor, Moon, Orbit, Sun, type LucideIcon } from 'lucide-react';
import { PopoverItem } from '../common/Popover';
import { useThemeStore, type ThemeMode } from '../../stores/themeStore';

interface ThemeOption {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: LucideIcon;
  colors: [string, string, string];
}

const OPTIONS: ThemeOption[] = [
  {
    mode: 'light',
    label: 'Sáng',
    description: 'Bento sáng mặc định',
    icon: Sun,
    colors: ['#f2f1ea', '#fbf9f1', '#30302f'],
  },
  {
    mode: 'dark',
    label: 'Tối',
    description: 'Trello tối tương phản cao',
    icon: Moon,
    colors: ['#15191e', '#20262d', '#579dff'],
  },
  {
    mode: 'ubuntu',
    label: 'Ubuntu 26',
    description: 'Yaru tối — aubergine & cam Ubuntu',
    icon: Orbit,
    colors: ['#2c001e', '#2a1e25', '#ff7043'],
  },
  {
    mode: 'mono',
    label: 'Đơn sắc',
    description: 'Đen trắng, tiêu đề khối, viền mảnh',
    icon: Contrast,
    colors: ['#f3f3f1', '#ffffff', '#111111'],
  },
  {
    mode: 'system',
    label: 'Theo hệ thống',
    description: 'Tự đổi theo thiết bị',
    icon: Monitor,
    colors: ['#f2f1ea', '#20262d', '#579dff'],
  },
];

function ThemeSwatch({ colors }: { colors: ThemeOption['colors'] }) {
  return (
    <span
      className="ml-auto flex shrink-0 -space-x-1 rounded-full border border-tr-border bg-tr-panel p-0.5"
      aria-hidden="true"
    >
      {colors.map((color) => (
        <span
          key={color}
          className="h-3.5 w-3.5 rounded-full border border-black/10"
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}

/**
 * Danh sach giao dien dang `menuitemradio`, mo trong menu tai khoan (AccountMenu).
 * Tu 1.14.0 thanh tren khong con nut Giao dien rieng.
 */
export function ThemeOptionItems({ onPicked }: { onPicked: () => void }) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  return (
    <>
      {OPTIONS.map(({ mode: value, label, description, icon: Icon, colors }) => (
        /* `menuitemradio` + `aria-checked`: day la mot lua chon LOAI TRU NHAU
           (chi mot giao dien duoc bat). Truoc day chung chi la cac nut thuong,
           nen trinh doc man hinh khong biet chung thuoc cung mot nhom, cung
           khong biet muc nao dang duoc chon — dau tich chi la mot icon. */
        <PopoverItem
          key={value}
          role="menuitemradio"
          checked={value === mode}
          icon={<Icon size={15} />}
          onClick={() => {
            setMode(value);
            onPicked();
          }}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">
              <span
                className={`flex items-center gap-1.5 ${
                  value === mode ? 'font-semibold text-tr-primary' : 'font-medium'
                }`}
              >
                {label}
                {value === mode && <Check size={13} aria-label="Đang chọn" />}
              </span>
              <span className="block truncate text-xs text-tr-muted">{description}</span>
            </span>
            <ThemeSwatch colors={colors} />
          </span>
        </PopoverItem>
      ))}
    </>
  );
}

/** Ten giao dien dang dung — hien canh muc Giao dien trong menu tai khoan. */
export function useThemeLabel(): string {
  const mode = useThemeStore((s) => s.mode);
  return (OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[1]).label;
}
