import { Fragment, type ReactNode } from 'react';

/**
 * Ve cau tra loi cua tro ly.
 *
 * Mo hinh tra ve Markdown du ta khong yeu cau — gach dau dong, danh sach danh
 * so, **in dam**, `ma nguon`. Truoc day ca doan duoc do ra bang
 * `whitespace-pre-wrap`, nen nguoi dung doc dung nhung dau sao va dau gach do
 * nhu la mot phan cua cau tra loi.
 *
 * TU VIET thay vi them react-markdown: goi do nang gan bang mot phan nam ngan
 * sach bundle (client/scripts/check-bundle.mjs) cho mot tap cu phap ma o day
 * chi dung den nam loai. Doi lai, thu gi khong nam trong nam loai do se hien
 * nguyen van — chap nhan duoc, va khong bao gio vo.
 *
 * KHONG dung `dangerouslySetInnerHTML` o bat ky dau: noi dung nay do mot mo
 * hinh ngon ngu sinh ra tu du lieu nguoi khac nhap vao CRM, nen phai coi la
 * khong dang tin. Moi thu duoi day deu la phan tu React that.
 */

/** `**dam**` va `` `ma` `` trong mot dong. Cac cu phap khac giu nguyen van. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    } else {
      parts.push(
        <code
          key={`${keyPrefix}-c${index}`}
          className="rounded bg-tr-hover px-1 py-0.5 font-mono text-[0.85em]"
        >
          {match[2]}
        </code>
      );
    }
    last = match.index + match[0].length;
    index += 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export interface Block {
  kind: 'para' | 'bullets' | 'numbers' | 'heading' | 'code';
  lines: string[];
}

/**
 * Gom cac dong thanh khoi.
 *
 * Doc mot luot tu tren xuong, moi dong chi nhin chinh no — khong co trang thai
 * long nhau nen khong co truong hop nao lam ham nay treo hay nhay khoi.
 */
export function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let fence: Block | null = null;

  for (const raw of source.split('\n')) {
    const line = raw.trimEnd();

    if (line.trimStart().startsWith('```')) {
      if (fence) {
        blocks.push(fence);
        fence = null;
      } else {
        fence = { kind: 'code', lines: [] };
      }
      continue;
    }
    if (fence) {
      fence.lines.push(raw);
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === '') {
      blocks.push({ kind: 'para', lines: [] });
      continue;
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    const heading = /^#{1,6}\s+(.*)$/.exec(trimmed);
    const last = blocks[blocks.length - 1];

    if (heading) {
      blocks.push({ kind: 'heading', lines: [heading[1]] });
    } else if (bullet) {
      if (last?.kind === 'bullets') last.lines.push(bullet[1]);
      else blocks.push({ kind: 'bullets', lines: [bullet[1]] });
    } else if (numbered) {
      if (last?.kind === 'numbers') last.lines.push(numbered[1]);
      else blocks.push({ kind: 'numbers', lines: [numbered[1]] });
    } else if ((last?.kind === 'bullets' || last?.kind === 'numbers') && last.lines.length > 0) {
      /* Dong thuong ngay sau mot gach dau dong (khong co dong trong ngan cach)
         la phan ĐUÔI cua chinh gach dau dong do — mo hinh xuong dong vi dong
         qua dai, khong phai vi het y. Tach ra thanh doan rieng se lam mot cau
         bi cat doi giua chung. */
      last.lines[last.lines.length - 1] += ` ${trimmed}`;
    } else if (last?.kind === 'para' && last.lines.length > 0) {
      /* Doan van bi mo hinh ngat dong giua chung thi noi lai — xuong dong that
         su la mot dong TRONG, dung nhu quy uoc cua Markdown. */
      last.lines.push(trimmed);
    } else {
      blocks.push({ kind: 'para', lines: [trimmed] });
    }
  }
  if (fence) blocks.push(fence);
  return blocks.filter((block) => block.lines.length > 0);
}

export function AnswerText({ text }: { text: string }) {
  const blocks = toBlocks(text);
  return (
    <div className="space-y-3 text-sm leading-7 text-tr-text">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        if (block.kind === 'code') {
          return (
            <pre
              key={key}
              className="tr-scroll overflow-x-auto rounded-panel bg-tr-list p-3 font-mono text-xs text-tr-subtle"
            >
              {block.lines.join('\n')}
            </pre>
          );
        }
        if (block.kind === 'heading') {
          return (
            <h3 key={key} className="text-sm font-semibold text-tr-text">
              {inline(block.lines[0], key)}
            </h3>
          );
        }
        if (block.kind === 'bullets' || block.kind === 'numbers') {
          const List = block.kind === 'bullets' ? 'ul' : 'ol';
          return (
            <List
              key={key}
              className={`space-y-1 pl-5 ${block.kind === 'bullets' ? 'list-disc' : 'list-decimal'} marker:text-tr-muted`}
            >
              {block.lines.map((line, i) => (
                <li key={`${key}-${i}`}>{inline(line, `${key}-${i}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={key}>
            {block.lines.map((line, i) => (
              <Fragment key={`${key}-${i}`}>
                {i > 0 && ' '}
                {inline(line, `${key}-${i}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
