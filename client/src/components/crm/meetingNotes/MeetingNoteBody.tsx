import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import {
  FormattingToolbar,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  filterSuggestionItems,
  type PartialBlock,
} from '@blocknote/core';
import { Sparkles } from 'lucide-react';
import { api } from '../../../api/client';
import { Button } from '../../common/ui';
import { VoiceNoteRecorder } from '../../common/VoiceNoteRecorder';
import { useThemeStore } from '../../../stores/themeStore';
import { useUiStore } from '../../../stores/uiStore';
import { useAssignees } from '../../tasks/AssigneePicker';
import { normalizeSearchText } from '../../../lib/text';
import { mindmapBlockSpec, mindmapSlashMenuItem } from './blocks/mindmapBlock';
import { flowchartBlockSpec, flowchartSlashMenuItem } from './blocks/flowchartBlock';
import { mentionInlineContentSpec, mentionMenuItems } from './blocks/mentionInline';
import { taskRefInlineContentSpec } from './blocks/taskRefInline';
import { taskSlashMenuItem } from './blocks/taskSlashMenuItem';

/**
 * Schema o pham vi module — dinh nghia mot lan, dung chung cho moi ghi chu. Chi
 * THEM hai loai khoi so do vao bo khoi mac dinh va hai loai noi dung inline
 * "mention" (tag ten) va "taskRef" (the tham chieu cong viec vua tao), khong
 * doi/xoa loai nao — noi dung cu van mo binh thuong.
 */
const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, mindmap: mindmapBlockSpec, flowchart: flowchartBlockSpec },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: mentionInlineContentSpec,
    taskRef: taskRefInlineContentSpec,
  },
});

type Instruction = 'continue' | 'fix_grammar' | 'rewrite' | 'shorten';

const INSTRUCTIONS: { key: Instruction; label: string; needsSelection: boolean }[] = [
  { key: 'continue', label: 'Viết tiếp', needsSelection: false },
  { key: 'fix_grammar', label: 'Sửa ngữ pháp', needsSelection: true },
  { key: 'rewrite', label: 'Viết lại', needsSelection: true },
  { key: 'shorten', label: 'Rút gọn', needsSelection: true },
];

function parseInitialContent(json: string): PartialBlock[] | undefined {
  if (!json || json === '[]') return undefined;
  try {
    const parsed = JSON.parse(json) as PartialBlock[];
    return parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Than soan thao that su, chi duoc nap qua LazyMeetingNoteBody.tsx (React.lazy)
 * de BlockNote khong lot vao bundle JS ban dau — xem check-bundle.mjs.
 *
 * Component nay duoc PARENT `key`-remount moi khi doi ghi chu (xem
 * MeetingNoteEditor.tsx) nen chi doc `initialContentJson` MOT LAN luc tao —
 * khong dong bo lai tu props sau do, giong cach cac trinh soan thao khoi
 * (block editor) khac quan ly noi dung khong kiem soat (uncontrolled).
 */
export default function MeetingNoteBody({
  noteId,
  initialContentJson,
  customerId,
  dealId,
  projectId,
  onChange,
}: {
  noteId: number;
  initialContentJson: string;
  customerId: number | null;
  dealId: number | null;
  projectId: number | null;
  onChange: (payload: { contentJson: string; contentText: string }) => void;
}) {
  const isDark = useThemeStore((s) => s.isDark());
  const openTaskComposer = useUiStore((s) => s.openTaskComposer);
  const initialContent = useMemo(() => parseInitialContent(initialContentJson), []);
  const editor = useCreateBlockNote({ schema, initialContent });
  const { data: contacts = [] } = useAssignees();
  const [hasSelection, setHasSelection] = useState(false);
  const [pending, setPending] = useState<Instruction | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(
    () =>
      editor.onSelectionChange(() => setHasSelection(editor.getSelectedText().trim().length > 0)),
    [editor]
  );

  /**
   * On dinh danh sach + ham getItems bang useMemo/useCallback — tranh tao lai
   * object/ham nay o moi lan render (vd. moi khi `hasSelection` doi lien tuc
   * luc go phim), vi SuggestionMenuController se hoi lai getItems du cau
   * truy van khong doi. Xem them ghi chu ve `group: ''` trong
   * taskSlashMenuItem.tsx cho mot loi rieng ve React key da gap phai o day.
   */
  const slashMenuItems = useMemo(
    () => [
      ...getDefaultReactSlashMenuItems(editor),
      mindmapSlashMenuItem(editor),
      flowchartSlashMenuItem(editor),
      taskSlashMenuItem(editor, openTaskComposer, { customerId, dealId, projectId }),
    ],
    [editor, openTaskComposer, customerId, dealId, projectId]
  );
  const getSlashMenuItems = useCallback(
    async (query: string) => filterSuggestionItems(slashMenuItems, query),
    [slashMenuItems]
  );
  const getMentionMenuItems = useCallback(
    async (query: string) => {
      const q = normalizeSearchText(query.trim());
      const matches = q
        ? contacts.filter((c) => normalizeSearchText(c.full_name).includes(q))
        : contacts;
      return mentionMenuItems(editor, matches);
    },
    [editor, contacts]
  );

  const runInline = async (instruction: Instruction) => {
    setPending(instruction);
    setAiError(null);
    try {
      const selectionText = editor.getSelectedText();
      const surroundingText = editor.blocksToMarkdownLossy().slice(-4000);
      const result = await api.post<{ text: string }>(
        `/api/ai/assist/meeting-note/${noteId}/inline`,
        { instruction, selection_text: selectionText, surrounding_text: surroundingText }
      );
      editor.insertInlineContent(result.text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI không phản hồi được, thử lại sau.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Sparkles size={13} className="shrink-0 text-tr-primary" aria-hidden="true" />
        {INSTRUCTIONS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            disabled={pending !== null || (item.needsSelection && !hasSelection)}
            onClick={() => runInline(item.key)}
          >
            {pending === item.key ? 'Đang xử lý…' : item.label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0 bg-tr-border" aria-hidden="true" />
        <VoiceNoteRecorder
          linkTarget={{ meeting_note_id: noteId }}
          onInsertText={(text) => editor.insertInlineContent(text)}
          onInsertAudio={({ url, name }) => {
            const cursor = editor.getTextCursorPosition();
            editor.insertBlocks([{ type: 'audio', props: { url, name } }], cursor.block, 'after');
          }}
        />
      </div>
      {aiError && <p className="mb-2 text-xs text-tr-danger">{aiError}</p>}
      <div className="meeting-note-canvas min-h-[220px] rounded-panel border border-tr-border bg-tr-list">
        <BlockNoteView
          editor={editor}
          theme={isDark ? 'dark' : 'light'}
          slashMenu={false}
          onChange={() =>
            onChange({
              contentJson: JSON.stringify(editor.document),
              contentText: editor.blocksToMarkdownLossy(),
            })
          }
        >
          <SuggestionMenuController triggerCharacter="/" getItems={getSlashMenuItems} />
          {/* Go "@" de tag mot lien he ngay trong noi dung — dung lai danh ba
              (useAssignees) giong AttendeesField, loc theo ten khong phan biet dau. */}
          <SuggestionMenuController triggerCharacter="@" getItems={getMentionMenuItems} />
          {/* Thanh cong cu dinh san (thay vi chi hien khi bam chon chu) — dung lai
              nguyen bo nut mac dinh cua BlockNote de day du dinh dang, chuyen doi
              khoi, chen lien ket... ma khong phai tu viet lai. Can giua (thay vi
              sat le trai) de thang hang voi cot noi dung da gioi han be rong o
              tren (xem .meeting-note-canvas trong index.css). */}
          <div className="flex justify-center border-t border-tr-border px-1 py-1">
            <FormattingToolbar />
          </div>
        </BlockNoteView>
      </div>
    </div>
  );
}
