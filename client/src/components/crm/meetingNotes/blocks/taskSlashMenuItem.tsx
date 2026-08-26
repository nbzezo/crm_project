import { ListTodo } from 'lucide-react';
import { insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import type { TaskComposerState } from '../../../../stores/uiStore';

/**
 * Muc "/" mo nhanh form "Tao cong viec" dung chung (TaskFormDialog) thay vi
 * chen mot khoi moi vao ghi chu — checklist trong note chi la danh sach viec
 * can lam dang van ban, con day tao THAT mot Card co du truong (nguoi phu
 * trach, han, do uu tien, lien ket CRM...) va lien ket san voi Co hoi/Du an
 * cua chinh ghi chu nay, giong cach luong "Tom tat bang AI" da lam.
 */
export function taskSlashMenuItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>,
  openTaskComposer: (state: TaskComposerState) => void,
  context: { customerId: number | null; dealId: number | null; projectId: number | null }
): DefaultReactSuggestionItem {
  return {
    title: 'Công việc',
    subtext: 'Tạo công việc mới, liên kết sẵn với cơ hội/dự án của ghi chú này',
    aliases: ['task', 'cong viec', 'viec can lam', 'todo'],
    /*
     * `group: ''` co y — DUNG dat mot ten nhom moi (vd "Công việc") o day.
     * BlockNote 0.54's SuggestionMenu dung `item.group` lam React `key` cho
     * dong tieu de nhom (xem SuggestionMenu.tsx); mot ten nhom hoan toan moi
     * chi xuat hien o CUOI danh sach lam React canh bao/hien thi trung dong
     * tieu de khi go nhanh (da kiem chung: "Công việc" bi loi, group rong
     * hoac trung ten nhom lien ke ("Sơ đồ") thi khong). Chuoi rong tao mot
     * dong phan cach vo hinh — an toan va van tach ro item nay khoi "Sơ đồ".
     */
    group: '',
    icon: <ListTodo size={18} />,
    onItemClick: () => {
      // Xoa ky tu "/" con lai (giong cach moi muc slash khac lam), giu con
      // tro dung tai cho — modal se giu tieu diem cho toi khi luu/dong nen vi
      // tri nay khong doi trong luc dien form.
      insertOrUpdateBlockForSlashMenu(editor, { type: 'paragraph', content: [] });
      openTaskComposer({
        context: {
          ...(context.customerId ? { customer_id: context.customerId } : {}),
          ...(context.dealId ? { deal_id: context.dealId } : {}),
        },
        projectId: context.projectId ?? undefined,
        // Tao xong thi chen mot the tham chieu ngay tai cho vua mo form —
        // nguoi dung thay ngay cong viec da tao trong chinh ghi chu nay.
        onCreated: (card) => {
          editor.insertInlineContent([
            { type: 'taskRef', props: { cardId: card.id, title: card.title } },
            ' ',
          ]);
        },
      });
    },
  };
}
