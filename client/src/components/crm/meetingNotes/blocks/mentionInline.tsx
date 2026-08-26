import { AtSign } from 'lucide-react';
import { createReactInlineContentSpec, type DefaultReactSuggestionItem } from '@blocknote/react';
import type { BlockNoteEditor } from '@blocknote/core';
import type { Assignee } from '../../../../types';

/**
 * Noi dung inline "mention" — gan mot lien he ngay trong van ban ghi chu (go
 * "@" de goi menu). `content: 'none'` nen la mot khoi nguyen tu (atom): khong
 * go duoc ben trong, xoa la xoa ca the.
 */
export const mentionInlineContentSpec = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      contactId: { default: 0 },
      label: { default: 'Không rõ' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <span className="rounded-full bg-tr-primary/15 px-1.5 py-0.5 text-[0.95em] font-medium text-tr-primary">
        @{props.inlineContent.props.label}
      </span>
    ),
  }
);

/**
 * `any` co y — xem giai thich tuong tu o mindmapBlock.tsx: kieu chung cua
 * BlockNote khong tuong thich duoc voi editor cu the do bat bien generic.
 */
export function mentionMenuItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>,
  contacts: Assignee[]
): DefaultReactSuggestionItem[] {
  return contacts.map((contact) => ({
    title: contact.full_name,
    subtext: contact.title ? `${contact.org_name} · ${contact.title}` : contact.org_name,
    icon: <AtSign size={16} />,
    onItemClick: () => {
      editor.insertInlineContent([
        { type: 'mention', props: { contactId: contact.id, label: contact.full_name } },
        ' ',
      ]);
    },
  }));
}
