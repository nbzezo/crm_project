import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  TTDDialog,
  TTDDialogTrigger,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { Download, Maximize2 } from 'lucide-react';
import { api } from '../../../../api/client';
import { useThemeStore } from '../../../../stores/themeStore';
import { Button } from '../../../common/ui';
import { ConfirmDialog } from '../../../common/ConfirmDialog';
import { DiagramFullscreen, DiagramNoteContext, downloadBlob } from './DiagramFullscreen';
import { parseScene, type FlowchartScene } from './diagramData';
import {
  FLOWCHART_TEMPLATES,
  templateSkeleton,
  type FlowchartTemplate,
} from './flowchartTemplates';

interface FlowchartBlock {
  id: string;
  props: { data: string };
}
interface FlowchartEditorApi {
  isEditable: boolean;
  updateBlock(block: { id: string }, update: Record<string, unknown>): unknown;
}
interface CanvasProps {
  block: FlowchartBlock;
  editor: FlowchartEditorApi;
}

/**
 * CSS cua Excalidraw khong tu dat kich thuoc cho `.excalidraw` — no gia dinh
 * duoc nhung toan trang (`html,body,#root{height:100%}`). Thieu height thi
 * `.excalidraw` va canvas ben trong do kich thuoc lan nhau den ~2^25px; thieu
 * width thi Excalidraw tuong la dien thoai va an thanh cong cu. Ep 100% trong
 * pham vi khung sua (data-flowchart-scope).
 */
const SIZE_FIX_CSS =
  '[data-flowchart-scope] .excalidraw { height: 100% !important; width: 100% !important; }';

type Elements = readonly { isDeleted?: boolean }[];

function serialize(elements: Elements, background: unknown): string {
  return JSON.stringify({
    elements: elements.filter((e) => !e.isDeleted),
    appState: { viewBackgroundColor: background },
  });
}

function exportAppState(scene: FlowchartScene, isDark: boolean) {
  return {
    exportBackground: true,
    exportWithDarkMode: isDark,
    viewBackgroundColor: (scene.appState.viewBackgroundColor as string | undefined) ?? '#ffffff',
  };
}

/**
 * Khoi so do logic trong trang: chi hien ANH XEM TRUOC tinh (SVG xuat tu du
 * lieu), khong bat cuon chuot va khong tu ghi gi khi mo trang. Bam "Chỉnh sửa"
 * hoac nhap dup de mo Excalidraw toan man hinh. Thu vien nap qua React.lazy
 * trong flowchartBlock.tsx.
 */
export default function FlowchartCanvas({ block, editor }: CanvasProps) {
  const canEdit = editor.isEditable;
  const isDark = useThemeStore((s) => s.isDark());
  const previewRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(() => canEdit && !block.props.data);
  const scene = parseScene(block.props.data);
  const empty = scene.elements.filter((e) => !e.isDeleted).length === 0;

  useEffect(() => {
    const target = previewRef.current;
    if (!target || empty) return;
    let cancelled = false;
    const current = parseScene(block.props.data);
    void exportToSvg({
      elements: current.elements as never,
      appState: exportAppState(current, isDark),
      files: null,
      exportPadding: 16,
    }).then((svg: SVGSVGElement) => {
      if (cancelled) return;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.setAttribute('style', 'width:100%;height:auto;max-height:520px;display:block');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Sơ đồ logic');
      target.replaceChildren(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [block.props.data, isDark, empty]);

  const exportPng = async () => {
    const blob = await exportToBlob({
      elements: scene.elements as never,
      appState: exportAppState(scene, isDark),
      files: null,
      mimeType: 'image/png',
      exportPadding: 16,
    });
    downloadBlob(blob, 'so-do-logic.png');
  };

  return (
    <div contentEditable={false} className="my-1 w-full min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-end gap-1.5">
        {canEdit && (
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
            <Maximize2 size={13} aria-hidden="true" /> Chỉnh sửa
          </Button>
        )}
        {!empty && (
          <Button size="sm" className="gap-1.5" onClick={() => void exportPng()}>
            <Download size={13} aria-hidden="true" /> PNG
          </Button>
        )}
      </div>
      {empty ? (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditing(true)}
          className="flex h-40 w-full items-center justify-center rounded-panel border border-dashed border-tr-border text-sm text-tr-muted hover:bg-tr-hover disabled:cursor-default"
        >
          {canEdit ? 'Sơ đồ trống — bấm để vẽ' : 'Sơ đồ trống'}
        </button>
      ) : (
        <div
          ref={previewRef}
          onDoubleClick={canEdit ? () => setEditing(true) : undefined}
          title={canEdit ? 'Nhấp đúp để chỉnh sửa' : undefined}
          className="flex min-h-24 justify-center overflow-hidden rounded-panel border border-tr-border"
        />
      )}
      {editing && (
        <FlowchartEditor
          block={block}
          editor={editor}
          isDark={isDark}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function FlowchartEditor({
  block,
  editor,
  isDark,
  onClose,
}: {
  block: FlowchartBlock;
  editor: FlowchartEditorApi;
  isDark: boolean;
  onClose: () => void;
}) {
  const noteId = useContext(DiagramNoteContext);
  const initial = useRef(parseScene(block.props.data));
  const lastSaved = useRef(block.props.data);
  const latest = useRef<{ elements: Elements; background: unknown } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [excalidraw, setExcalidraw] = useState<ExcalidrawImperativeAPI | null>(null);
  const [pendingTemplate, setPendingTemplate] = useState<FlowchartTemplate | null>(null);

  // `initialData.scrollToContent` chi cuon toi, khong thu nho — so do lon bi cat.
  useEffect(() => {
    if (!excalidraw) return;
    const frame = requestAnimationFrame(() =>
      excalidraw.scrollToContent(undefined, { fitToContent: true })
    );
    return () => cancelAnimationFrame(frame);
  }, [excalidraw]);

  // Chi tuan tu hoa luc luu (khong phai moi lan onChange): Excalidraw goi
  // onChange theo tung khung hinh khi re chuot.
  const save = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!latest.current) return;
    const next = serialize(latest.current.elements, latest.current.background);
    if (next === lastSaved.current) return;
    lastSaved.current = next;
    editor.updateBlock(block, { type: 'flowchart', props: { data: next } });
  }, [editor, block.id]);

  // Xem ghi chu cung cho o MindmapCanvas.tsx (MindmapEditor).
  // shortcut: doi route luc dang sua co the mat toi da 400ms thao tac cuoi; nut "Xong" luon luu.
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

  const insertTemplate = (template: FlowchartTemplate) => {
    if (!excalidraw) return;
    const elements = convertToExcalidrawElements(templateSkeleton(template) as never);
    excalidraw.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    excalidraw.scrollToContent(elements, { fitToContent: true });
  };

  const chooseTemplate = (key: string) => {
    const template = FLOWCHART_TEMPLATES.find((t) => t.key === key);
    if (!template || !excalidraw) return;
    const hasContent = excalidraw.getSceneElements().length > 0;
    if (hasContent) setPendingTemplate(template);
    else insertTemplate(template);
  };

  const toolbar = (
    <select
      value=""
      onChange={(e) => chooseTemplate(e.target.value)}
      aria-label="Chèn mẫu sơ đồ"
      className="rounded-control border border-tr-border bg-tr-panel px-1.5 py-1 text-xs text-tr-text"
    >
      <option value="">Dùng mẫu…</option>
      {FLOWCHART_TEMPLATES.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );

  return (
    <DiagramFullscreen
      title="Sơ đồ logic"
      toolbar={toolbar}
      onDone={() => {
        save();
        onClose();
      }}
    >
      <div data-flowchart-scope="" className="h-full w-full">
        <style>{SIZE_FIX_CSS}</style>
        <Excalidraw
          // Khong dat langCode="vi-VN": ban dich tieng Viet cua Excalidraw 0.18 moi
          // ~49%, duoi nguong thu vien chap nhan nen no tu quay ve tieng Anh.
          theme={isDark ? 'dark' : 'light'}
          excalidrawAPI={setExcalidraw}
          // Anh luu dang base64 ngay trong scene — de vuot gioi han 2 MB cua trang.
          UIOptions={{ tools: { image: false } }}
          initialData={{
            elements: initial.current.elements as never,
            appState: { ...initial.current.appState, theme: isDark ? 'dark' : 'light' },
            scrollToContent: true,
          }}
          onChange={(elements, appState) => {
            latest.current = { elements, background: appState.viewBackgroundColor };
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(save, 400);
          }}
        >
          {/* "Văn bản thành sơ đồ" co san cua Excalidraw: tab Mermaid chay ngay
              tren may; tab AI goi may chu, tra ve Mermaid de Excalidraw tu ve. */}
          {noteId !== null && (
            <TTDDialog
              onTextSubmit={async (input) => {
                try {
                  const { mermaid } = await api.post<{ mermaid: string }>(
                    `/api/ai/assist/meeting-note/${noteId}/diagram`,
                    { kind: 'flowchart', prompt: input }
                  );
                  return { generatedResponse: mermaid };
                } catch (err) {
                  return {
                    error: err instanceof Error ? err : new Error('AI không tạo được sơ đồ'),
                  };
                }
              }}
            />
          )}
          <TTDDialogTrigger />
        </Excalidraw>
      </div>
      <ConfirmDialog
        open={pendingTemplate !== null}
        title="Thay sơ đồ hiện tại?"
        message="Mẫu sẽ thay toàn bộ hình đang vẽ. Có thể hoàn tác bằng Ctrl+Z."
        confirmLabel="Dùng mẫu"
        tone="primary"
        onCancel={() => setPendingTemplate(null)}
        onConfirm={() => {
          if (pendingTemplate) insertTemplate(pendingTemplate);
          setPendingTemplate(null);
        }}
      />
    </DiagramFullscreen>
  );
}
