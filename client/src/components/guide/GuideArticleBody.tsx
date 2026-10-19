import { isValidElement, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { foldVietnamese } from '../../lib/settingsNav';
import { focusRing } from '../common/ui';

/*
 * Ve than mot bai huong dan tu Markdown.
 *
 * Markdown chu khong phai TSX vi noi dung huong dan la VAN BAN: nguoi viet bai
 * khong phai doc mot dong JSX nao de them mot muc. Doi lai, moi the HTML sinh ra
 * phai duoc gan vao dung token mau cua san pham o duoi day, de bai viet khong
 * tro thanh mot hon dao co phong chu rieng.
 */

/** Gom chu trong mot nhanh React de doc duoc chu dau cua mot khoi trich dan. */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return '';
}

/** Id cho tieu de muc, de link `#...` tro thang vao giua bai. */
export function headingId(text: string): string {
  return (
    foldVietnamese(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'muc'
  );
}

const CALLOUTS = [
  { match: 'canh bao', icon: AlertTriangle, tone: 'border-tr-warning/45 bg-tr-warning/10' },
  { match: 'meo', icon: Lightbulb, tone: 'border-tr-success/45 bg-tr-success/10' },
  { match: 'luu y', icon: Info, tone: 'border-tr-primary/45 bg-tr-primary/10' },
] as const;

function calloutStyle(text: string) {
  const head = foldVietnamese(text).slice(0, 24);
  return CALLOUTS.find((entry) => head.startsWith(entry.match)) ?? null;
}

function Heading({ level, children }: { level: 2 | 3 | 4; children: ReactNode }) {
  const text = nodeText(children);
  const id = headingId(text);
  const size =
    level === 2
      ? 'mt-8 text-lg font-semibold'
      : level === 3
        ? 'mt-6 text-base font-semibold'
        : 'mt-5 text-sm font-semibold';
  const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
  return (
    <Tag id={id} className={`group scroll-mt-20 text-tr-text first:mt-0 ${size}`}>
      {children}
      {/* Neo de copy duong dan toi dung muc nay. Luon hien (mo), khong an sau
          hover: tren man cam ung khong co trang thai hover de lam no hien ra. */}
      <a
        href={`#${id}`}
        aria-label={`Liên kết tới mục ${text}`}
        className={`ml-2 text-tr-muted/60 transition hover:text-tr-primary ${focusRing}`}
      >
        #
      </a>
    </Tag>
  );
}

const components: Components = {
  h1: ({ children }) => <Heading level={2}>{children}</Heading>,
  h2: ({ children }) => <Heading level={2}>{children}</Heading>,
  h3: ({ children }) => <Heading level={3}>{children}</Heading>,
  h4: ({ children }) => <Heading level={4}>{children}</Heading>,

  p: ({ children }) => <p className="mt-3 text-sm leading-relaxed text-tr-subtle">{children}</p>,

  ul: ({ children }) => (
    <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-tr-subtle">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-tr-subtle">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="marker:text-tr-muted">{children}</li>,

  strong: ({ children }) => <strong className="font-semibold text-tr-text">{children}</strong>,

  hr: () => <hr className="my-7 border-tr-border" />,

  a: ({ href, children }) => {
    const target = href ?? '';
    if (target.startsWith('/')) {
      return (
        <Link
          to={target}
          className={`text-tr-primary underline-offset-2 hover:underline ${focusRing}`}
        >
          {children}
        </Link>
      );
    }
    const external = /^https?:/i.test(target);
    return (
      <a
        href={target}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className={`text-tr-primary underline-offset-2 hover:underline ${focusRing}`}
      >
        {children}
      </a>
    );
  },

  code: ({ children }) => (
    <code className="rounded-control border border-tr-border bg-tr-surface px-1.5 py-0.5 font-mono text-[0.8em] text-tr-text">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-panel border border-tr-border bg-tr-surface p-3 text-xs leading-relaxed text-tr-text">
      {children}
    </pre>
  ),

  /* Trich dan = khoi luu y. Giong dieu lay tu tu dau: "Luu y", "Meo", "Canh bao". */
  blockquote: ({ children }) => {
    const style = calloutStyle(nodeText(children));
    const Icon = style?.icon ?? Info;
    return (
      <div
        className={`mt-4 flex gap-2.5 rounded-panel border px-3.5 py-3 ${
          style?.tone ?? 'border-tr-border bg-tr-surface'
        }`}
      >
        <Icon size={16} className="mt-0.5 shrink-0 text-tr-subtle" aria-hidden="true" />
        <div className="min-w-0 [&>p:first-child]:mt-0">{children}</div>
      </div>
    );
  },

  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto rounded-panel border border-tr-border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-tr-surface text-left text-xs font-semibold text-tr-subtle">
      {children}
    </thead>
  ),
  th: ({ children }) => (
    <th scope="col" className="border-b border-tr-border px-3 py-2 align-top">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-tr-border px-3 py-2 align-top text-tr-subtle last:border-b-0">
      {children}
    </td>
  ),

  /*
   * Anh minh hoa. Dung <span> khoi thay vi <figure> vi Markdown goi anh nam
   * trong mot doan van — <figure> long trong <p> la HTML khong hop le va React
   * se canh bao. `alt` lam luon loi chu thich: mot cau, viet mot lan.
   */
  img: ({ src, alt }) => {
    const source = typeof src === 'string' ? src : '';
    const caption = alt ?? '';
    return (
      <span className="mt-4 block">
        {/* `max-w-full` chu khong phai `w-full`: anh cat hep (mot thanh ben, mot
            menu) phai giu dung kich thuoc that, keo gian len ca cot noi dung thi
            vua xau vua mo. Anh ca man hinh van tu thu lai cho vua. */}
        <a
          href={source}
          target="_blank"
          rel="noreferrer noopener"
          className={`inline-block max-w-full overflow-hidden rounded-panel border border-tr-border bg-tr-surface ${focusRing}`}
        >
          <img src={source} alt={caption} loading="lazy" className="block h-auto max-w-full" />
        </a>
        {caption && (
          <span className="mt-1.5 block text-xs leading-relaxed text-tr-muted">{caption}</span>
        )}
      </span>
    );
  },
};

export default function GuideArticleBody({ body }: { body: string }) {
  const plugins = useMemo(() => [remarkGfm], []);
  return (
    <div className="max-w-3xl">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
