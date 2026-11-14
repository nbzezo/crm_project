import type { PartialBlock } from '@blocknote/core';

/*
 * Chuyen doi du lieu thuan cho hai khoi so do — khong import mind-elixir hay
 * Excalidraw, de dung duoc ca o chunk BlockNote (xuat van ban cho tim kiem/AI,
 * doi dan y <-> so do) ma khong keo thu vien ve vao.
 */

export interface MindNode {
  id: string;
  topic: string;
  children?: MindNode[];
  expanded?: boolean;
}
/** Phan du lieu mind-elixir ma ung dung doc/ghi; cac truong khac giu nguyen. */
export interface MindmapDoc {
  nodeData: MindNode;
  direction?: 0 | 1 | 2 | 3;
  [key: string]: unknown;
}
export interface TopicTree {
  topic: string;
  children?: TopicTree[];
}

/** Bo cuc mac dinh cua mind-elixir: toa hai ben (MindElixir.SIDE). */
export const SIDE = 2;

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function treeToMindmap(tree: TopicTree, direction: 0 | 1 | 2 | 3 = SIDE): MindmapDoc {
  const toNode = (t: TopicTree): MindNode => ({
    id: newId(),
    topic: t.topic,
    children: (t.children ?? []).map(toNode),
  });
  return { nodeData: toNode(tree), direction };
}

export function parseMindmap(raw: string): MindmapDoc | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MindmapDoc;
    return parsed?.nodeData ? parsed : null;
  } catch {
    return null;
  }
}

export function mindmapOutline(doc: MindmapDoc): TopicTree {
  const walk = (n: MindNode): TopicTree => ({
    topic: n.topic,
    children: (n.children ?? []).map(walk),
  });
  return walk(doc.nodeData);
}

/* ---- Dan y (khoi danh sach BlockNote) <-> so do tu duy ---- */

export const LIST_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);

export interface BlockLike {
  type?: string;
  content?: unknown;
  children?: BlockLike[];
}

/** Chu thuan cua noi dung inline BlockNote (text, link, @tag, the cong viec). */
export function inlineText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(
      (item: {
        type?: string;
        text?: string;
        content?: unknown;
        props?: Record<string, unknown>;
      }) => {
        if (item.type === 'text') return item.text ?? '';
        if (item.type === 'link') return inlineText(item.content);
        if (item.type === 'mention') return `@${String(item.props?.label ?? '')}`;
        if (item.type === 'taskRef') return String(item.props?.title ?? '');
        return '';
      }
    )
    .join('')
    .trim();
}

/**
 * Mot muc goc duy nhat thi muc do lam goc; nhieu muc thi gom duoi `rootTopic`.
 * Khoi rong bi bo qua (nhanh rong vo nghia tren so do).
 */
export function listBlocksToTree(blocks: BlockLike[], rootTopic: string): TopicTree {
  const walk = (b: BlockLike): TopicTree | null => {
    const topic = inlineText(b.content);
    const children = (b.children ?? []).map(walk).filter((c): c is TopicTree => c !== null);
    if (!topic && children.length === 0) return null;
    return { topic: topic || '…', children };
  };
  const items = blocks.map(walk).filter((c): c is TopicTree => c !== null);
  const [onlyItem] = items;
  if (items.length === 1 && onlyItem) return onlyItem;
  return { topic: rootTopic, children: items };
}

export function mindmapToListBlocks(doc: MindmapDoc): PartialBlock[] {
  const walk = (n: MindNode): PartialBlock => ({
    type: 'bulletListItem',
    content: n.topic,
    children: (n.children ?? []).map(walk),
  });
  return [walk(doc.nodeData)];
}

/* ---- So do logic (Excalidraw) ---- */

export interface FlowchartScene {
  elements: readonly { type?: string; text?: string; isDeleted?: boolean }[];
  appState: Record<string, unknown>;
}

export function parseScene(raw: string): FlowchartScene {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<FlowchartScene>;
      if (Array.isArray(parsed.elements)) {
        return { elements: parsed.elements, appState: parsed.appState ?? {} };
      }
    } catch {
      /* du lieu hong — tra canvas rong ben duoi */
    }
  }
  return { elements: [], appState: {} };
}

/** Chu tren so do logic, theo thu tu ve — dua vao content_text de tim kiem va AI doc duoc. */
export function flowchartTexts(raw: string): string[] {
  return parseScene(raw)
    .elements.filter((e) => e.type === 'text' && !e.isDeleted && e.text?.trim())
    .map((e) => (e.text ?? '').replace(/\s+/g, ' ').trim());
}
