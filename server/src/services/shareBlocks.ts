/*
 * Doi noi dung BlockNote (content_json) cua "Trang tai lieu" sang mot cay don gian,
 * AN TOAN de dua ra trang cong khai.
 *
 * Khong gui JSON tho cua trinh soan thao ra ngoai: no co the chua id noi bo, props
 * cua khoi tuy chinh (so do, mindmap), tham chieu cong viec / danh ba. Day la danh
 * sach TRANG — chi nhung loai khoi duoc liet ke duoi day moi ra ngoai, moi thu
 * khac thanh mot dong chu thich "(noi dung khong hien thi)".
 *
 * Duong dan (href) chi nhan http/https/mailto/tel: `javascript:` va `data:` bi bo.
 */

export interface PublicRun {
  t: string;
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  c?: true;
  href?: string;
}

export interface PublicBlock {
  type:
    | 'paragraph'
    | 'heading'
    | 'bullet'
    | 'number'
    | 'check'
    | 'quote'
    | 'code'
    | 'divider'
    | 'table'
    | 'omitted';
  level?: number;
  checked?: boolean;
  runs: PublicRun[];
  /** Chi voi `table`: hang -> o -> cac doan chu. */
  rows?: PublicRun[][][];
  children: PublicBlock[];
}

const MAX_DEPTH = 8;
const MAX_BLOCKS = 5000;
const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function runsOf(content: unknown): PublicRun[] {
  if (typeof content === 'string') return content ? [{ t: content }] : [];
  if (!Array.isArray(content)) return [];
  const runs: PublicRun[] = [];
  for (const item of content) {
    if (!isObject(item)) continue;
    if (item.type === 'text' && typeof item.text === 'string') {
      const styles = isObject(item.styles) ? item.styles : {};
      const run: PublicRun = { t: item.text };
      if (styles.bold) run.b = true;
      if (styles.italic) run.i = true;
      if (styles.underline) run.u = true;
      if (styles.strike) run.s = true;
      if (styles.code) run.c = true;
      runs.push(run);
    } else if (item.type === 'link' && typeof item.href === 'string') {
      const inner = runsOf(item.content);
      const href = SAFE_HREF.test(item.href.trim()) ? item.href.trim() : undefined;
      for (const run of inner) runs.push(href ? { ...run, href } : run);
    } else if (isObject(item.props) && typeof item.props.label === 'string') {
      /* Nhac ten nguoi (mention) / tham chieu cong viec (taskRef): chi lay nhan chu,
         khong lo id danh ba hay id cong viec. */
      runs.push({ t: item.type === 'mention' ? `@${item.props.label}` : item.props.label });
    }
  }
  return runs;
}

function tableRows(content: unknown): PublicRun[][][] {
  if (!isObject(content) || content.type !== 'tableContent' || !Array.isArray(content.rows)) {
    return [];
  }
  return content.rows.map((row) => {
    const cells = isObject(row) && Array.isArray(row.cells) ? row.cells : [];
    return cells.map((cell) => runsOf(isObject(cell) && 'content' in cell ? cell.content : cell));
  });
}

const OMITTED: PublicBlock = {
  type: 'omitted',
  runs: [{ t: '(Nội dung này chỉ xem được trong CRM)', i: true }],
  children: [],
};

export function toPublicBlocks(contentJson: string): PublicBlock[] {
  let raw: unknown;
  try {
    raw = JSON.parse(contentJson);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  let count = 0;

  function convert(list: unknown[], depth: number): PublicBlock[] {
    const out: PublicBlock[] = [];
    for (const item of list) {
      if (!isObject(item) || count >= MAX_BLOCKS) continue;
      count += 1;
      const props = isObject(item.props) ? item.props : {};
      const children =
        depth < MAX_DEPTH && Array.isArray(item.children) ? convert(item.children, depth + 1) : [];
      switch (item.type) {
        case 'paragraph':
          out.push({ type: 'paragraph', runs: runsOf(item.content), children });
          break;
        case 'heading': {
          const level = Math.min(3, Math.max(1, Number(props.level) || 1));
          out.push({ type: 'heading', level, runs: runsOf(item.content), children });
          break;
        }
        case 'bulletListItem':
          out.push({ type: 'bullet', runs: runsOf(item.content), children });
          break;
        case 'numberedListItem':
          out.push({ type: 'number', runs: runsOf(item.content), children });
          break;
        case 'checkListItem':
          out.push({
            type: 'check',
            checked: props.checked === true,
            runs: runsOf(item.content),
            children,
          });
          break;
        case 'quote':
          out.push({ type: 'quote', runs: runsOf(item.content), children });
          break;
        case 'codeBlock':
          out.push({ type: 'code', runs: runsOf(item.content), children });
          break;
        case 'table':
          out.push({ type: 'table', runs: [], rows: tableRows(item.content), children });
          break;
        case 'divider':
          out.push({ type: 'divider', runs: [], children: [] });
          break;
        default:
          /* Khoi tuy chinh (so do, mindmap), anh, tep, ... */
          out.push({ ...OMITTED });
      }
    }
    return out;
  }

  return convert(raw, 0);
}
