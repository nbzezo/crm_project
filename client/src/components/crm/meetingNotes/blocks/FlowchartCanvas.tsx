import { useRef } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { useThemeStore } from '../../../../stores/themeStore';

interface CanvasProps {
  block: { id: string; props: { data: string } };
  editor: { updateBlock: (block: { id: string }, update: Record<string, unknown>) => void };
}

interface FlowchartScene {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
}

function parseData(raw: string): FlowchartScene {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<FlowchartScene>;
      if (Array.isArray(parsed.elements)) {
        return { elements: parsed.elements, appState: parsed.appState ?? {} };
      }
    } catch {
      /* du lieu hong — tao canvas rong ben duoi */
    }
  }
  return { elements: [], appState: {} };
}

/**
 * Than ve so do logic that su — chi duoc nap qua React.lazy trong
 * flowchartBlock.tsx de Excalidraw (thu vien nang nhat, keo theo ~25 goi phu
 * thuoc) khong lot vao chunk BlockNote. Xem ghi chu trong flowchartBlock.tsx.
 *
 * Tat cong cu chen anh (`UIOptions.tools.image`) — anh duoc Excalidraw luu dang
 * base64 ngay trong scene, khong gioi han thi de vuot gioi han content_json cua
 * ghi chu (2 MB, packages/contracts/src/schemas.ts) rat nhanh.
 *
 * `import '@excalidraw/excalidraw/index.css'` la BAT BUOC — package khong tu
 * dong nap CSS cua no (khac BlockNote/mind-elixir), thieu dong nay toan bo
 * thanh cong cu/icon deu mat kieu dang, chi con text va SVG kich thuoc goc.
 *
 * CSS di kem cua Excalidraw cung khong tu dat kich thuoc cho div goc `.excalidraw`
 * — no gia dinh ung dung nhung no vao la toan trang, noi chuoi
 * `html,body,#root{height:100%}` da co san lo chuyen tiep 100% xuong. Trong mot
 * khoi ghi chu (mot the bai co kich thuoc co dinh, khong phai toan trang), khong
 * co chuoi 100% do — thieu height khien `.excalidraw` roi vao `height:auto`, tu
 * do kich thuoc theo canvas ben trong no, ma canvas lai tu do theo `.excalidraw`
 * — vong lap phan hoi nay khien chieu cao phinh toi han canvas cua trinh duyet
 * (~2^25px); thieu width khien Excalidraw doc nham thanh man hinh dien thoai
 * (class `excalidraw--mobile`), an ca thanh cong cu. Ep `100%` ca hai chieu
 * truc tiep de cat dut, chi trong pham vi khoi nay
 * (data-flowchart-scope).
 */
const HEIGHT_FIX_CSS =
  '[data-flowchart-scope] .excalidraw { height: 100% !important; width: 100% !important; }';

export default function FlowchartCanvas({ block, editor }: CanvasProps) {
  const isDark = useThemeStore((s) => s.isDark());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial = useRef(parseData(block.props.data));

  return (
    <div
      contentEditable={false}
      data-flowchart-scope=""
      className="my-1 rounded-panel border border-tr-border"
      style={{ height: 480, width: '100%', minWidth: 0, position: 'relative', display: 'block' }}
    >
      <style>{HEIGHT_FIX_CSS}</style>
      <Excalidraw
        theme={isDark ? 'dark' : 'light'}
        UIOptions={{ tools: { image: false } }}
        initialData={{
          elements: initial.current.elements as never,
          appState: { ...initial.current.appState, theme: isDark ? 'dark' : 'light' },
        }}
        onChange={(elements, appState) => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            editor.updateBlock(block, {
              type: 'flowchart',
              props: {
                data: JSON.stringify({
                  elements,
                  appState: { viewBackgroundColor: appState.viewBackgroundColor },
                }),
              },
            });
          }, 400);
        }}
      />
    </div>
  );
}
