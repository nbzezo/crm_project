import { lazy, Suspense } from 'react';
import { createReactBlockSpec, type DefaultReactSuggestionItem } from '@blocknote/react';
import { insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core';
import { BrainCircuit } from 'lucide-react';
import { Skeleton } from '../../../common/ui';

/**
 * MindmapCanvas import truc tiep 'mind-elixir' o dinh module — tach rieng file de
 * import dong (React.lazy) chi tai thu vien ve khi mot khoi 'mindmap' THAT SU duoc
 * hien thi, khong phai moi lan mo bat ky ghi chu nao. Xem muc "Nap luoi ba tang"
 * trong ke hoach.
 */
const MindmapCanvas = lazy(() => import('./MindmapCanvas'));

export const mindmapBlockSpec = createReactBlockSpec(
  {
    type: 'mindmap',
    propSchema: {
      data: { default: '' },
      // Chieu cao nguoi dung tu keo gian (MindmapCanvas.tsx) — luu lai de mo
      // ghi chu lan sau giu dung kich thuoc da chinh, khong bi reset ve mac dinh.
      height: { default: 480 },
      // Ten bang mau nhanh da chon (xem PALETTES trong MindmapCanvas.tsx),
      // 'default' = dung nguyen palette sang/toi goc cua mind-elixir.
      palette: { default: 'default' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <Suspense fallback={<Skeleton className="my-1 h-[480px] rounded-panel" />}>
        <MindmapCanvas block={props.block} editor={props.editor} />
      </Suspense>
    ),
  }
)(); // createReactBlockSpec tra ve ham khoi tao (de nhan options) — goi ngay vi khong can options.

/**
 * `any` co y — schema thuc te cua editor (bao gom ca cac khoi tuy bien mindmap/
 * flowchart, dinh nghia o MeetingNoteBody.tsx) khong the tham chieu nguoc lai tu
 * day (vong lap import), va cac kieu chung `BlockSchema`/`InlineContentSchema`/
 * `StyleSchema` cua BlockNote khong tuong thich duoc voi editor cu the do bat
 * bien (invariance) trong dinh nghia generic cua `BlockNoteEditor`.
 */
export function mindmapSlashMenuItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>
): DefaultReactSuggestionItem {
  return {
    title: 'Sơ đồ tư duy',
    subtext: 'Vẽ mindmap — Tab thêm nhánh con, Enter thêm nhánh ngang',
    aliases: ['mindmap', 'mind map', 'so do tu duy', 'tu duy'],
    group: 'Sơ đồ',
    icon: <BrainCircuit size={18} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, { type: 'mindmap' });
    },
  };
}
