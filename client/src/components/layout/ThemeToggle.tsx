import {
  Check,
  CircleDot,
  LayoutPanelTop,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
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
    mode: 'neo-tactile',
    label: 'Neo ấm',
    description: 'Bề mặt nổi màu kem & đồng',
    icon: Sparkles,
    colors: ['#e8dfd4', '#f3ece3', '#a35f3b'],
  },
  {
    mode: 'neat-slate',
    label: 'Neat Slate',
    description: 'Ghi trung tính & xanh than',
    icon: LayoutPanelTop,
    colors: ['#c8c5be', '#eff0ed', '#263b48'],
  },
  {
    mode: 'cream-teal',
    label: 'Kem ngọc',
    description: 'Neumorphic kem & xanh teal',
    icon: CircleDot,
    colors: ['#e8e0cf', '#f4eddd', '#087274'],
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

export function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const pop = usePopover();
  const activeOption = OPTIONS.find((option) => option.mode === mode) ?? OPTIONS[1];
  const Current = activeOption.icon;

  return (
    <>
      <button
        type="button"
        onClick={pop.toggle}
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-full border border-tr-border bg-tr-panel text-tr-muted shadow-sm transition hover:border-tr-primary/20 hover:text-tr-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary sm:h-9 sm:w-9 xl:w-auto xl:px-2.5"
        aria-label={`Giao diện: ${activeOption.label}`}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
      >
        <Current size={18} aria-hidden="true" />
        <span className="hidden text-xs font-semibold xl:inline">{activeOption.label}</span>
      </button>

      <Popover
        open={pop.open}
        anchor={pop.anchor}
        onClose={pop.close}
        title="Giao diện"
        width={286}
      >
        {OPTIONS.map(({ mode: value, label, description, icon: Icon, colors }) => (
          <PopoverItem
            key={value}
            icon={<Icon size={15} />}
            onClick={() => {
              setMode(value);
              pop.close();
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
                <span className="block truncate text-2xs text-tr-muted">{description}</span>
              </span>
              <ThemeSwatch colors={colors} />
            </span>
          </PopoverItem>
        ))}
      </Popover>
    </>
  );
}
