import { Monitor, Moon, Sun } from 'lucide-react';
import { Popover, PopoverItem, usePopover } from '../common/Popover';
import { useThemeStore, type ThemeMode } from '../../stores/themeStore';

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Sáng', icon: Sun },
  { mode: 'dark', label: 'Tối', icon: Moon },
  { mode: 'system', label: 'Theo hệ thống', icon: Monitor },
];

export function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const pop = usePopover();
  const Current = OPTIONS.find((o) => o.mode === mode)!.icon;

  return (
    <>
      <button
        type="button"
        onClick={pop.toggle}
        className="flex h-11 w-11 items-center justify-center rounded-panel text-tr-navfg-muted transition hover:bg-white/10 hover:text-tr-navfg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
        aria-label={`Giao diện: ${OPTIONS.find((o) => o.mode === mode)!.label}`}
        aria-haspopup="dialog"
        aria-expanded={pop.open}
      >
        <Current size={18} aria-hidden="true" />
      </button>

      <Popover open={pop.open} anchor={pop.anchor} onClose={pop.close} title="Giao diện" width={220}>
        {OPTIONS.map(({ mode: value, label, icon: Icon }) => (
          <PopoverItem
            key={value}
            icon={<Icon size={15} />}
            onClick={() => {
              setMode(value);
              pop.close();
            }}
          >
            <span className={value === mode ? 'font-semibold text-tr-primary' : ''}>{label}</span>
          </PopoverItem>
        ))}
      </Popover>
    </>
  );
}
