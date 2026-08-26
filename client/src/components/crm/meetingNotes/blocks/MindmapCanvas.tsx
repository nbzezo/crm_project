import { useEffect, useRef, useState } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance, type Theme, type Topic } from 'mind-elixir';
import 'mind-elixir/style';
import { Download, GripHorizontal } from 'lucide-react';
import { useThemeStore } from '../../../../stores/themeStore';
import { Button } from '../../../common/ui';

interface CanvasProps {
  block: { id: string; props: { data: string; height: number; palette: string } };
  editor: { updateBlock: (block: { id: string }, update: Record<string, unknown>) => void };
}

const MIN_HEIGHT = 320;
const MAX_HEIGHT = 1000;

/**
 * Vai bang mau nhanh ngoai 2 theme sang/toi mac dinh cua mind-elixir — chi doi
 * `palette` (mau day nhanh cap 1), giu nguyen `cssVar` (nen/chu) cua theme
 * sang/toi dang dung de van doc duoc trong ca 2 che do. Mau lay tu thang Tailwind
 * co san, khong bia moi bang mau rieng.
 */
const PALETTES: Record<string, { label: string; swatch: string; colors: string[] }> = {
  default: { label: 'Mặc định', swatch: '#94a3b8', colors: [] },
  blue: {
    label: 'Xanh dương',
    swatch: '#0ea5e9',
    colors: [
      '#0ea5e9', '#0284c7', '#0369a1', '#38bdf8', '#7dd3fc',
      '#06b6d4', '#0891b2', '#155e75', '#3b82f6', '#1d4ed8',
    ],
  },
  green: {
    label: 'Xanh lá',
    swatch: '#22c55e',
    colors: [
      '#22c55e', '#16a34a', '#15803d', '#4ade80', '#86efac',
      '#10b981', '#059669', '#065f46', '#84cc16', '#65a30d',
    ],
  },
  orange: {
    label: 'Cam ấm',
    swatch: '#f97316',
    colors: [
      '#f97316', '#ea580c', '#c2410c', '#fb923c', '#fdba74',
      '#f59e0b', '#d97706', '#b45309', '#ef4444', '#dc2626',
    ],
  },
};

function parseData(raw: string): MindElixirData {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MindElixirData;
      if (parsed?.nodeData) return parsed;
    } catch {
      /* du lieu hong — tao moi ben duoi */
    }
  }
  return MindElixir.new('Chủ đề mới');
}

function buildTheme(isDark: boolean, paletteKey: string): Theme {
  const base = isDark ? MindElixir.DARK_THEME : MindElixir.THEME;
  const preset = PALETTES[paletteKey];
  return preset && preset.colors.length > 0 ? { ...base, palette: preset.colors } : base;
}

/**
 * Than ve mindmap that su — chi duoc nap qua React.lazy trong mindmapBlock.tsx de
 * mind-elixir khong lot vao chunk BlockNote (xem check-bundle.mjs va ghi chu trong
 * mindmapBlock.tsx).
 *
 * Khong dieu khien theo props.block.props.data sau lan init dau — chinh instance
 * nay la nguon GHI ra prop do (qua bus 'operation'), dieu khien nguoc lai se tao
 * vong lap vo ich va co the mat con tro dang go cua nguoi dung.
 */
export default function MindmapCanvas({ block, editor }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const isDark = useThemeStore((s) => s.isDark());
  const [height, setHeight] = useState(block.props.height || 480);
  const [paletteKey, setPaletteKey] = useState(block.props.palette || 'default');
  const resizeStart = useRef<{ y: number; height: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const isNewMap = !block.props.data;
    const instance: MindElixirInstance = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      theme: buildTheme(isDark, block.props.palette || 'default'),
      toolBar: true,
      keypress: true,
      contextMenu: true,
    });
    instance.init(parseData(block.props.data));
    instanceRef.current = instance;

    // Khoi rong (vua chen tu slash-menu, chua co du lieu luu) thi tu mo o go
    // ten cho node goc luon — nguoi dung go duoc ngay khong can double-click
    // truoc, giong nguyen tac "focus ngay" cua QuickNoteBody.tsx. CHI ap dung
    // khi thuc su rong — mo lai mindmap da co san du lieu se KHONG bi ep vao
    // che do sua, tranh go de len ten node da dat truoc do.
    if (isNewMap) {
      const rootEl = instance.map.querySelector<Topic>('me-root>me-tpc');
      if (rootEl) {
        instance.selectNode(rootEl);
        instance.beginEdit(rootEl);
      }
    }

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        editor.updateBlock(block, { type: 'mindmap', props: { data: instance.getDataString() } });
      }, 400);
    };
    instance.bus.addListener('operation', handleChange);

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      instance.bus.removeListener('operation', handleChange);
      instance.destroy();
      instanceRef.current = null;
    };
    // Chi tao lai instance khi doi khoi (id) hoac doi theme — KHONG phu thuoc
    // block.props.data, ly do xem chu thich tren ham.
  }, [block.id, isDark]);

  const choosePalette = (key: string) => {
    setPaletteKey(key);
    editor.updateBlock(block, { type: 'mindmap', props: { palette: key } });
    instanceRef.current?.changeTheme(buildTheme(isDark, key));
  };

  const exportPng = async () => {
    const instance = instanceRef.current;
    if (!instance) return;
    const blob = await instance.exportPng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${instance.nodeData.topic || 'mindmap'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeStart.current = { y: e.clientY, height };
    const handleMove = (ev: PointerEvent) => {
      if (!resizeStart.current) return;
      const next = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, resizeStart.current.height + (ev.clientY - resizeStart.current.y))
      );
      setHeight(next);
    };
    const handleUp = (ev: PointerEvent) => {
      handleMove(ev);
      resizeStart.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setHeight((h) => {
        editor.updateBlock(block, { type: 'mindmap', props: { height: h } });
        return h;
      });
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  return (
    // min-w-0 la BAT BUOC: khoi cha `.bn-block-content` cua BlockNote la flex
    // container, va div nay la flex-item truc tiep cua no. Flex-item mac dinh
    // co "automatic minimum size" tinh theo content-width — voi mindmap chi can
    // vai nhanh chu dai la du de phinh box nay ra hang nghin px va tran ra
    // ngoai khung ghi chu (canvas ben trong CO overflow-hidden, nhung do la
    // chau chu khong phai flex-item nen khong tu duoc min-width:0 nhu flex-item
    // co overflow rieng). min-w-0 ep ve dung quy tac "flex-item co the co hep
    // hon content" de div luon nam vua trong 760px cua cot ghi chu.
    <div contentEditable={false} className="my-1 min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="Bảng màu nhánh">
          {Object.entries(PALETTES).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={paletteKey === key}
              onClick={() => choosePalette(key)}
              className={`h-5 w-5 shrink-0 rounded-full border-2 transition ${
                paletteKey === key ? 'border-tr-primary' : 'border-transparent hover:border-tr-border'
              }`}
              style={{ backgroundColor: preset.swatch }}
            />
          ))}
        </div>
        <Button size="sm" onClick={exportPng} className="gap-1.5">
          <Download size={13} aria-hidden="true" />
          Xuất ảnh
        </Button>
      </div>

      <div
        ref={containerRef}
        style={{ height }}
        className="w-full min-w-0 overflow-hidden rounded-panel border border-tr-border"
      />

      <div
        onPointerDown={startResize}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Kéo để đổi chiều cao khung vẽ"
        className="flex h-3 cursor-row-resize items-center justify-center text-tr-muted hover:text-tr-subtle"
      >
        <GripHorizontal size={14} aria-hidden="true" />
      </div>
    </div>
  );
}
