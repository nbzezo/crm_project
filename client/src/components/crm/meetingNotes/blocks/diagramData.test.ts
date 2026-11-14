import { describe, expect, it } from 'vitest';
import {
  flowchartTexts,
  listBlocksToTree,
  mindmapOutline,
  mindmapToListBlocks,
  parseMindmap,
  treeToMindmap,
} from './diagramData';

const list = [
  {
    type: 'bulletListItem',
    content: [{ type: 'text', text: 'Mục tiêu' }],
    children: [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'Doanh thu' }], children: [] },
      {
        type: 'bulletListItem',
        content: [
          { type: 'mention', props: { label: 'An' } },
          { type: 'text', text: ' phụ trách' },
        ],
        children: [],
      },
    ],
  },
  { type: 'bulletListItem', content: [{ type: 'text', text: 'Rủi ro' }], children: [] },
  { type: 'bulletListItem', content: [], children: [] },
];

describe('dan y <-> so do tu duy', () => {
  it('nhieu muc goc thi gom duoi chu de chung, bo muc rong, giu @tag', () => {
    expect(listBlocksToTree(list, 'Chủ đề')).toEqual({
      topic: 'Chủ đề',
      children: [
        {
          topic: 'Mục tiêu',
          children: [
            { topic: 'Doanh thu', children: [] },
            { topic: '@An phụ trách', children: [] },
          ],
        },
        { topic: 'Rủi ro', children: [] },
      ],
    });
  });

  it('mot muc goc thi muc do lam goc', () => {
    const [firstList] = list;
    if (!firstList) throw new Error('thieu du lieu mau');
    expect(listBlocksToTree([firstList], 'Chủ đề').topic).toBe('Mục tiêu');
  });

  it('doi qua lai khong mat nhanh', () => {
    const tree = listBlocksToTree(list, 'Chủ đề');
    const doc = treeToMindmap(tree);
    expect(mindmapOutline(doc)).toEqual(tree);
    const ids = new Set<string>();
    const collect = (n: { id: string; children?: { id: string }[] }) => {
      ids.add(n.id);
      n.children?.forEach(collect);
    };
    collect(doc.nodeData);
    expect(ids.size).toBe(5);

    const blocks = mindmapToListBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'bulletListItem', content: 'Chủ đề' });
    expect(listBlocksToTree(blocks as never, 'x')).toEqual(tree);
  });

  it('du lieu hong thi tra null', () => {
    expect(parseMindmap('')).toBeNull();
    expect(parseMindmap('{bad')).toBeNull();
    expect(parseMindmap('{"a":1}')).toBeNull();
  });
});

describe('chu tren so do logic', () => {
  it('chi lay khoi chu con hien, gop khoang trang', () => {
    const raw = JSON.stringify({
      elements: [
        { type: 'rectangle' },
        { type: 'text', text: 'Bắt\n đầu' },
        { type: 'text', text: 'Đã xoá', isDeleted: true },
        { type: 'text', text: '  ' },
        { type: 'text', text: 'Duyệt' },
      ],
    });
    expect(flowchartTexts(raw)).toEqual(['Bắt đầu', 'Duyệt']);
    expect(flowchartTexts('oops')).toEqual([]);
  });
});
