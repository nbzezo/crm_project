import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import MindElixir, {
  type MindElixirData,
  type MindElixirInstance,
  type Theme,
  type Topic,
} from 'mind-elixir';
import type { LangPack } from 'mind-elixir/i18n';
import 'mind-elixir/style';
import { Download, GripHorizontal, ListTree, Maximize2, Sparkles } from 'lucide-react';
import { api } from '../../../../api/client';
import { useThemeStore } from '../../../../stores/themeStore';
import { useUiStore } from '../../../../stores/uiStore';
import { Button } from '../../../common/ui';
import { ConfirmDialog } from '../../../common/ConfirmDialog';
import { COARSE_QUERY, useMediaQuery } from '../../../../lib/useMediaQuery';
import { DiagramFullscreen, DiagramNoteContext, downloadBlob } from './DiagramFullscreen';
import {
  mindmapToListBlocks,
  parseMindmap,
  SIDE,
  treeToMindmap,
  type TopicTree,
} from './diagramData';

interface MindmapBlock {
  id: string;
  props: { data: string; height: number; palette: string };
}
/* Cu phap phuong thuc (khong phai thuoc tinh ham) de TS so kieu hai chieu — editor
   that co kieu generic theo schema, khong gan thang duoc vao kieu hep nay. */
interface MindmapEditorApi {
  isEditable: boolean;
  updateBlock(block: { id: string }, update: Record<string, unknown>): unknown;
  replaceBlocks(remove: string[], insert: never[]): unknown;
}
interface CanvasProps {
  block: MindmapBlock;
  editor: MindmapEditorApi;
}

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 1000;

/** mind-elixir khong co san tieng Viet cho menu chuot phai. */
const VI: LangPack = {
  addChild: 'Thêm nhánh con',
  addParent: 'Thêm nhánh cha',
  addSibling: 'Thêm nhánh ngang',
  removeNode: 'Xoá nhánh',
  focus: 'Chỉ xem nhánh này',
  cancelFocus: 'Xem toàn bộ',
  moveUp: 'Lên trên',
  moveDown: 'Xuống dưới',
  link: 'Nối tới nhánh khác',
  linkBidirectional: 'Nối hai chiều',
  clickTips: 'Bấm vào nhánh muốn nối tới',
  summary: 'Gom nhóm',
};

const LAYOUTS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 2, label: 'Toả hai bên' },
  { value: 1, label: 'Toả sang phải' },
  { value: 0, label: 'Toả sang trái' },
  { value: 3, label: 'Cây xuống dưới' },
];

/**
 * Vai bang mau nhanh ngoai 2 theme sang/toi mac dinh cua mind-elixir — chi doi
 * `palette` (mau day nhanh cap 1), giu nguyen `cssVar` (nen/chu) cua theme
 * sang/toi dang dung de van doc duoc trong ca 2 che do.
 */
const PALETTES: Record<string, { label: string; swatch: string; colors: string[] }> = {
  default: { label: 'Mặc định', swatch: '#94a3b8', colors: [] },
  blue: {
    label: 'Xanh dương',
    swatch: '#0ea5e9',
    colors: [
      '#0ea5e9',
      '#0284c7',
      '#0369a1',
      '#38bdf8',
      '#7dd3fc',
      '#06b6d4',
      '#0891b2',
      '#155e75',
      '#3b82f6',
      '#1d4ed8',
    ],
  },
  green: {
    label: 'Xanh lá',
    swatch: '#22c55e',
    colors: [
      '#22c55e',
      '#16a34a',
      '#15803d',
      '#4ade80',
      '#86efac',
      '#10b981',
      '#059669',
      '#065f46',
      '#84cc16',
      '#65a30d',
    ],
  },
  orange: {
    label: 'Cam ấm',
    swatch: '#f97316',
    colors: [
      '#f97316',
      '#ea580c',
      '#c2410c',
      '#fb923c',
      '#fdba74',
      '#f59e0b',
      '#d97706',
      '#b45309',
      '#ef4444',
      '#dc2626',
    ],
  },
};

function buildTheme(isDark: boolean, paletteKey: string): Theme {
  const base = isDark ? MindElixir.DARK_THEME : MindElixir.THEME;
  const preset = PALETTES[paletteKey];
  return preset && preset.colors.length > 0 ? { ...base, palette: preset.colors } : base;
}

/**
 * Du lieu de init. Bo `theme` da luu: mind-elixir `init()` uu tien theme trong
 * du lieu hon theme truyen vao, nen ban luu luc dang o che do sang se ep mau
 * sang ca khi nguoi dung chuyen sang toi.
 */
function initialData(raw: string): MindElixirData {
  const doc = parseMindmap(raw);
  if (!doc) return MindElixir.new('Chủ đề mới');
  const copy = { ...doc };
  delete copy.theme;
  return copy;
}

function exportName(instance: MindElixirInstance, ext: string) {
  return `${(instance.nodeData.topic || 'so-do-tu-duy').slice(0, 60)}.${ext}`;
}

async function exportPng(instance: MindElixirInstance | null) {
  if (!instance) return;
  const blob = await instance.exportPng();
  if (blob) downloadBlob(blob, exportName(instance, 'png'));
}

function exportSvg(instance: MindElixirInstance | null) {
  if (instance) downloadBlob(instance.exportSvg(), exportName(instance, 'svg'));
}

function ExportButtons({ getInstance }: { getInstance: () => MindElixirInstance | null }) {
  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => void exportPng(getInstance())}>
        <Download size={13} aria-hidden="true" /> PNG
      </Button>
      <Button size="sm" className="gap-1.5" onClick={() => exportSvg(getInstance())}>
        <Download size={13} aria-hidden="true" /> SVG
      </Button>
    </>
  );
}

/**
 * Khoi so do tu duy trong trang: chi hien BAN XEM (khong sua, khong bat cuon
 * chuot cua trang), bam "Chỉnh sửa" hoac nhap dup de mo khung sua toan man hinh.
 * mind-elixir chi duoc nap qua React.lazy trong mindmapBlock.tsx.
 */
export default function MindmapCanvas({ block, editor }: CanvasProps) {
  const canEdit = editor.isEditable;
  const isDark = useThemeStore((s) => s.isDark());
  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<MindElixirInstance | null>(null);
  // Khoi vua chen tu menu "/" (chua co du lieu) thi mo ngay khung sua.
  const [editing, setEditing] = useState(() => canEdit && !block.props.data);
  const [height, setHeight] = useState(block.props.height || 480);
  const resizeStart = useRef<{ y: number; height: number } | null>(null);
  const palette = block.props.palette || 'default';

  useEffect(() => {
    if (!containerRef.current) return;
    const instance: MindElixirInstance = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      theme: buildTheme(isDark, palette),
      editable: false,
      toolBar: false,
      keypress: false,
      contextMenu: false,
    });
    instance.init(initialData(block.props.data));
    instance.scaleFit();
    previewRef.current = instance;
    return () => {
      instance.destroy();
      previewRef.current = null;
    };
  }, [block.props.data, isDark, palette]);

  const toOutline = () => {
    const doc = parseMindmap(block.props.data);
    if (doc) editor.replaceBlocks([block.id], mindmapToListBlocks(doc) as never[]);
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    resizeStart.current = { y: e.clientY, height };
    const handleMove = (ev: PointerEvent) => {
      if (!resizeStart.current) return;
      setHeight(
        Math.min(
          MAX_HEIGHT,
          Math.max(MIN_HEIGHT, resizeStart.current.height + (ev.clientY - resizeStart.current.y))
        )
      );
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
    // min-w-0 la BAT BUOC: `.bn-block-content` cua BlockNote la flex container;
    // thieu no, vai nhanh chu dai la du phinh khoi tran ra ngoai cot ghi chu.
    <div contentEditable={false} className="my-1 w-full min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-end gap-1.5">
        {canEdit && (
          <>
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              onClick={() => setEditing(true)}
            >
              <Maximize2 size={13} aria-hidden="true" /> Chỉnh sửa
            </Button>
            <Button size="sm" className="gap-1.5" onClick={toOutline}>
              <ListTree size={13} aria-hidden="true" /> Chuyển thành dàn ý
            </Button>
          </>
        )}
        <ExportButtons getInstance={() => previewRef.current} />
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          style={{ height }}
          className="w-full min-w-0 overflow-hidden rounded-panel border border-tr-border"
        />
        {/* Lop phu: chan moi tuong tac voi ban xem (keo, phong to bang con lan)
            de cuon chuot van cuon trang tai lieu; nhap dup de mo khung sua. */}
        <div
          className="absolute inset-0"
          onDoubleClick={canEdit ? () => setEditing(true) : undefined}
          title={canEdit ? 'Nhấp đúp để chỉnh sửa' : undefined}
        />
      </div>

      {canEdit && (
        <div
          onPointerDown={startResize}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Kéo để đổi chiều cao khung xem"
          className="flex h-6 cursor-row-resize touch-none items-center justify-center text-tr-muted hover:text-tr-subtle"
        >
          <GripHorizontal size={14} aria-hidden="true" />
        </div>
      )}

      {editing && (
        <MindmapEditor
          block={block}
          editor={editor}
          isDark={isDark}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function MindmapEditor({
  block,
  editor,
  isDark,
  onClose,
}: {
  block: MindmapBlock;
  editor: MindmapEditorApi;
  isDark: boolean;
  onClose: () => void;
}) {
  const noteId = useContext(DiagramNoteContext);
  const pushToast = useUiStore((s) => s.pushToast);
  const coarsePointer = useMediaQuery(COARSE_QUERY);
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<MindElixirInstance | null>(null);
  const lastSaved = useRef(block.props.data);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paletteKey, setPaletteKey] = useState(block.props.palette || 'default');
  const [direction, setDirection] = useState<0 | 1 | 2 | 3>(
    parseMindmap(block.props.data)?.direction ?? SIDE
  );
  const [hasSelection, setHasSelection] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPending, setAiPending] = useState(false);
  const [aiResult, setAiResult] = useState<TopicTree | null>(null);

  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const instance = instanceRef.current;
    if (!instance) return;
    const next = instance.getDataString();
    if (next === lastSaved.current) return;
    lastSaved.current = next;
    editor.updateBlock(block, { type: 'mindmap', props: { data: next } });
    // block chi dung de lay id — doi tuong cu van dung.
  }, [editor, block.id]);

  useEffect(() => {
    if (!containerRef.current) return;
    const isNewMap = !lastSaved.current;
    const instance: MindElixirInstance = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.SIDE,
      theme: buildTheme(isDark, paletteKey),
      toolBar: true,
      keypress: true,
      contextMenu: { locale: VI, focus: true, link: true },
    });
    // Doc tu lastSaved chu khong tu block.props: khi doi theme giua chung, ban
    // moi nhat la ban vua luu tu chinh instance nay.
    instance.init(initialData(lastSaved.current));
    instanceRef.current = instance;

    if (isNewMap) {
      save(); // co du lieu ngay — mo lai trang se khong tu bat khung sua nua
      const rootEl = instance.map.querySelector<Topic>('me-root>me-tpc');
      if (rootEl) {
        instance.selectNode(rootEl);
        void instance.beginEdit(rootEl);
      }
    }

    const scheduleSave = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(save, 400);
    };
    const handleSelection = () => setHasSelection(Boolean(instance.currentNode));
    const handleDirection = (value: number) => {
      setDirection(value as 0 | 1 | 2 | 3);
      scheduleSave();
    };
    instance.bus.addListener('operation', scheduleSave);
    instance.bus.addListener('expandNode', scheduleSave);
    instance.bus.addListener('changeDirection', handleDirection);
    instance.bus.addListener('selectNodes', handleSelection);
    instance.bus.addListener('unselectNodes', handleSelection);
    return () => {
      save();
      instance.bus.removeListener('operation', scheduleSave);
      instance.bus.removeListener('expandNode', scheduleSave);
      instance.bus.removeListener('changeDirection', handleDirection);
      instance.bus.removeListener('selectNodes', handleSelection);
      instance.bus.removeListener('unselectNodes', handleSelection);
      instance.destroy();
      instanceRef.current = null;
    };
    // Bang mau doi bang changeTheme ben duoi, khong tao lai instance.
  }, [isDark, save]);

  // Ghi not thay doi dang cho truoc khi go khoi (layout cleanup chay truoc
  // cleanup thuong cua MeetingNoteEditor, noi tu luu ca trang).
  // shortcut: neu ca trinh soan thao dong cung luc (doi route) thi editor co the da
  // huy truoc — mat toi da 400ms thao tac cuoi; nut "Xong" luon luu chac chan.
  useLayoutEffect(
    () => () => {
      try {
        save();
      } catch {
        /* editor da huy */
      }
    },
    [save]
  );

  const changeLayout = (value: 0 | 1 | 2 | 3) => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (value === 0) instance.initLeft();
    else if (value === 1) instance.initRight();
    else if (value === 3) instance.initDown();
    else instance.initSide();
  };

  const choosePalette = (key: string) => {
    setPaletteKey(key);
    editor.updateBlock(block, { type: 'mindmap', props: { palette: key } });
    instanceRef.current?.changeTheme(buildTheme(isDark, key));
  };

  const applyTree = (tree: TopicTree) => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.refresh(treeToMindmap(tree, direction));
    instance.toCenter();
    save();
  };

  const generate = async () => {
    if (noteId === null) return;
    setAiPending(true);
    try {
      const { tree } = await api.post<{ tree: TopicTree }>(
        `/api/ai/assist/meeting-note/${noteId}/diagram`,
        { kind: 'mindmap', prompt: aiPrompt }
      );
      const current = instanceRef.current?.nodeData.children?.length ?? 0;
      if (current > 0) setAiResult(tree);
      else applyTree(tree);
      setAiOpen(false);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'AI không tạo được sơ đồ');
    } finally {
      setAiPending(false);
    }
  };

  const toolbar = (
    <>
      <label className="flex items-center gap-1.5 text-xs text-tr-subtle">
        Bố cục
        <select
          value={direction}
          onChange={(e) => changeLayout(Number(e.target.value) as 0 | 1 | 2 | 3)}
          className="rounded-control border border-tr-border bg-tr-panel px-1.5 py-1 text-xs text-tr-text"
        >
          {LAYOUTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
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
      {noteId !== null && (
        <Button size="sm" className="gap-1.5" onClick={() => setAiOpen((v) => !v)}>
          <Sparkles size={13} className="text-tr-primary" aria-hidden="true" /> Tạo bằng AI
        </Button>
      )}
      <ExportButtons getInstance={() => instanceRef.current} />
    </>
  );

  return (
    <DiagramFullscreen
      title="Sơ đồ tư duy"
      toolbar={toolbar}
      onDone={() => {
        save();
        onClose();
      }}
    >
      {aiOpen && (
        <form
          className="absolute inset-x-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-panel border border-tr-border bg-tr-panel p-2 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Mô tả sơ đồ cần vẽ — để trống thì AI dựng từ nội dung trang"
            aria-label="Mô tả sơ đồ cho AI"
            className="min-w-0 flex-1 rounded-control border border-tr-border bg-tr-panel px-2 py-1.5 text-sm text-tr-text"
            autoFocus
          />
          <Button type="submit" variant="primary" size="sm" disabled={aiPending}>
            {aiPending ? 'Đang tạo…' : 'Tạo sơ đồ'}
          </Button>
        </form>
      )}
      <div ref={containerRef} className="h-full w-full" />

      {coarsePointer && hasSelection && (
        <div
          className="absolute inset-x-0 bottom-0 z-10 grid grid-cols-4 gap-1 border-t border-tr-border bg-tr-panel p-1 pb-[calc(0.25rem+var(--tr-safe-bottom))]"
          role="toolbar"
          aria-label="Chỉnh sửa nhánh sơ đồ tư duy"
        >
          <button
            type="button"
            className="min-h-11 rounded-control text-xs text-tr-text"
            onClick={() => void instanceRef.current?.addChild()}
          >
            + Nhánh con
          </button>
          <button
            type="button"
            className="min-h-11 rounded-control text-xs text-tr-text"
            onClick={() => void instanceRef.current?.insertSibling('after')}
          >
            + Nhánh ngang
          </button>
          <button
            type="button"
            className="min-h-11 rounded-control text-xs text-tr-text"
            onClick={() => void instanceRef.current?.beginEdit()}
          >
            Sửa
          </button>
          <button
            type="button"
            className="min-h-11 rounded-control text-xs text-tr-danger"
            onClick={() => {
              const instance = instanceRef.current;
              if (instance?.currentNode) void instance.removeNodes([instance.currentNode]);
            }}
          >
            Xoá
          </button>
        </div>
      )}

      <ConfirmDialog
        open={aiResult !== null}
        title="Thay sơ đồ hiện tại?"
        message="Sơ đồ AI vừa tạo sẽ thay toàn bộ sơ đồ đang có. Có thể hoàn tác bằng Ctrl+Z trong trang."
        confirmLabel="Thay sơ đồ"
        tone="primary"
        onCancel={() => setAiResult(null)}
        onConfirm={() => {
          if (aiResult) applyTree(aiResult);
          setAiResult(null);
        }}
      />
    </DiagramFullscreen>
  );
}
