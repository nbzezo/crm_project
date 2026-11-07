import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtensionState,
} from '@blocknote/react';
import { SideMenuExtension } from '@blocknote/core/extensions';
import type { BlockNoteEditor } from '@blocknote/core';
import { LIST_TYPES, listBlocksToTree, treeToMindmap, type BlockLike } from './diagramData';

/**
 * Doi ca cum danh sach lien tiep chua khoi `blockId` (cung cap, ke ca cac muc
 * con) thanh mot khoi so do tu duy — giong Lark: dan y va so do la hai cach
 * nhin cung mot noi dung. Hoan tac bang Ctrl+Z.
 */
export function convertListToMindmap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: BlockNoteEditor<any, any, any>,
  blockId: string
) {
  const parent = editor.getParentBlock(blockId);
  const siblings = (parent ? parent.children : editor.document) as (BlockLike & { id: string })[];
  const index = siblings.findIndex((b) => b.id === blockId);
  if (index < 0) return;
  let start = index;
  let end = index;
  while (start > 0 && LIST_TYPES.has(siblings[start - 1].type ?? '')) start--;
  while (end < siblings.length - 1 && LIST_TYPES.has(siblings[end + 1].type ?? '')) end++;
  const run = siblings.slice(start, end + 1);
  const doc = treeToMindmap(listBlocksToTree(run, 'Chủ đề'));
  editor.replaceBlocks(
    run.map((b) => b.id),
    [{ type: 'mindmap', props: { data: JSON.stringify(doc) } }]
  );
}

function ToMindmapItem() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
  if (!Components || !block || !LIST_TYPES.has(block.type) || !editor.isEditable) return null;
  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => convertListToMindmap(editor, block.id)}
    >
      Chuyển thành sơ đồ tư duy
    </Components.Generic.Menu.Item>
  );
}

/** Menu ⋮⋮ mac dinh cua BlockNote + muc doi dan y thanh so do tu duy. */
function NoteDragHandleMenu() {
  const dict = useDictionary();
  return (
    <DragHandleMenu>
      <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
      <BlockColorsItem>{dict.drag_handle.colors_menuitem}</BlockColorsItem>
      <TableRowHeaderItem>{dict.drag_handle.header_row_menuitem}</TableRowHeaderItem>
      <TableColumnHeaderItem>{dict.drag_handle.header_column_menuitem}</TableColumnHeaderItem>
      <ToMindmapItem />
    </DragHandleMenu>
  );
}

/** Dat trong BlockNoteView (kem `sideMenu={false}`) thay cho menu ben mac dinh. */
export function NoteSideMenu() {
  return (
    <SideMenuController
      sideMenu={(props) => <SideMenu {...props} dragHandleMenu={NoteDragHandleMenu} />}
    />
  );
}
