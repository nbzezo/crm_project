import { useEffect, useRef } from 'react';
import MindElixir, { type MindElixirData, type MindElixirInstance } from 'mind-elixir';
import 'mind-elixir/style';
import { useThemeStore } from '../../../../stores/themeStore';

interface CanvasProps {
  block: { id: string; props: { data: string } };
  editor: { updateBlock: (block: { id: string }, update: Record<string, unknown>) => void };
}

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
  const isDark = useThemeStore((s) => s.isDark());

  useEffect(() => {
    if (!containerRef.current) return;
    const instance: MindElixirInstance = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      theme: isDark ? MindElixir.DARK_THEME : MindElixir.THEME,
      toolBar: true,
      keypress: true,
      contextMenu: true,
    });
    instance.init(parseData(block.props.data));

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
    };
    // Chi tao lai instance khi doi khoi (id) hoac doi theme — KHONG phu thuoc
    // block.props.data, ly do xem chu thich tren ham.
  }, [block.id, isDark]);

  return (
    <div
      contentEditable={false}
      ref={containerRef}
      className="my-1 h-[480px] overflow-hidden rounded-panel border border-tr-border"
    />
  );
}
