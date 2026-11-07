import { lazy, Suspense } from 'react';
import { createReactBlockSpec, type DefaultReactSuggestionItem } from '@blocknote/react';
import { insertOrUpdateBlockForSlashMenu, type BlockNoteEditor } from '@blocknote/core';
import { Workflow } from 'lucide-react';
import { Skeleton } from '../../../common/ui';
import { flowchartTexts } from './diagramData';

/**
 * FlowchartCanvas import truc tiep '@excalidraw/excalidraw' o dinh module — thu
 * vien nang nhat trong ba khoi tuy bien (keo theo ~25 goi phu thuoc). Tach rieng
 * file de import dong (React.lazy) chi tai khi mot khoi 'flowchart' THAT SU duoc
 * hien thi. Xem muc "Nap luoi ba tang" trong ke hoach.
 */
const FlowchartCanvas = lazy(() => import('./FlowchartCanvas'));

export const flowchartBlockSpec = createReactBlockSpec(
  {
    type: 'flowchart',
    propSchema: { data: { default: '' } },
    content: 'none',
  },
  {
    render: (props) => (
      <Suspense fallback={<Skeleton className="my-1 h-[480px] rounded-panel" />}>
        <FlowchartCanvas block={props.block} editor={props.editor} />
      </Suspense>
    ),
    /* Chu tren so do vao content_text (tim kiem, Tom tat AI) — xem mindmapBlock.tsx. */
    toExternalHTML: (props) => {
      const texts = flowchartTexts(props.block.props.data);
      return texts.length > 0 ? (
        <ul>
          {texts.map((text, index) => (
            <li key={index}>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p />
      );
    },
  }
)(); // createReactBlockSpec tra ve ham khoi tao (de nhan options) — goi ngay vi khong can options.

/**
 * `any` co y — xem chu thich o mindmapBlock.tsx (cung ly do, cung mau).
 */
export function flowchartSlashMenuItem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>
): DefaultReactSuggestionItem {
  return {
    title: 'Sơ đồ logic',
    subtext: 'Vẽ tự do — hình khối, mũi tên nối, chữ',
    aliases: ['flowchart', 'so do logic', 'so do khoi', 've so do'],
    group: 'Sơ đồ',
    icon: <Workflow size={18} />,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, { type: 'flowchart' });
    },
  };
}
