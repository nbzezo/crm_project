import { useEffect, useMemo } from 'react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import { useCreateBlockNote } from '@blocknote/react';
import type { PartialBlock } from '@blocknote/core';
import { vi } from '@blocknote/core/locales';
import { useThemeStore } from '../../stores/themeStore';
import { VoiceNoteRecorder } from '../common/VoiceNoteRecorder';

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
 * Than soan thao Ghi chu nhanh — chi duoc nap qua LazyQuickNoteBody.tsx (React.lazy).
 *
 * CO Y dung schema BlockNote MAC DINH (khong mindmap/flowchart/mention/taskRef
 * nhu MeetingNoteBody.tsx) — do la tien ich rieng cho Ghi chu hop CRM, ngoai
 * pham vi "ghi nhanh, toi gian" cua module nay (BRD muc 13: khong xay editor
 * qua phuc tap). BlockNote mac dinh da co san Bold/Bullet/Number/Check List/
 * Link ma FR05 yeu cau.
 *
 * Component nay duoc PARENT `key`-remount moi khi doi ghi chu, nen chi doc
 * `initialContentJson` MOT LAN luc tao — giong MeetingNoteBody.tsx.
 *
 * Tu focus vao con tro luc mo — bam mot ghi chu la go duoc ngay, khong can
 * bam them lan hai vao vung soan thao (dung nhu Sticky Notes that).
 */
export default function QuickNoteBody({
  noteId,
  initialContentJson,
  onChange,
}: {
  noteId: number;
  initialContentJson: string;
  onChange: (payload: { contentJson: string; contentText: string }) => void;
}) {
  const isDark = useThemeStore((s) => s.isDark());
  const initialContent = useMemo(() => parseInitialContent(initialContentJson), []);
  /* `dictionary: vi` — BlockNote mac dinh chay tieng Anh, nen o soan thao hien
     "Enter text or type '/' for commands" giua mot ung dung hoan toan tieng Viet.
     Thu vien co san ban dich vi; menu slash va thanh cong cu cung theo do. */
  const editor = useCreateBlockNote({ initialContent, dictionary: vi });

  useEffect(() => {
    editor.focus();
  }, []);

  return (
    <div className="quick-note-canvas min-h-[80px]">
      <div className="mb-1.5">
        <VoiceNoteRecorder
          linkTarget={{ quick_note_id: noteId }}
          onInsertText={(text) => editor.insertInlineContent(text)}
          onInsertAudio={({ url, name }) => {
            const cursor = editor.getTextCursorPosition();
            editor.insertBlocks([{ type: 'audio', props: { url, name } }], cursor.block, 'after');
          }}
        />
      </div>
      <BlockNoteView
        editor={editor}
        theme={isDark ? 'dark' : 'light'}
        onChange={() =>
          onChange({
            contentJson: JSON.stringify(editor.document),
            contentText: editor.blocksToMarkdownLossy(),
          })
        }
      />
    </div>
  );
}
