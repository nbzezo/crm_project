import { foldVietnamese } from './settingsNav';
import { articleMeta, type GuideArticle } from './guideNav';

/*
 * Than cac bai huong dan.
 *
 * Tach khoi lib/guideNav.ts vi o tim Ctrl+K (nam trong goi chinh) chi can ten
 * va tu khoa cua bai; keo ca Markdown vao do la bat moi nguoi tai toan bo tai
 * lieu huong dan ngay o man hinh dau tien.
 *
 * Nap san (eager) trong chunk cua trang Huong dan: o tim trong trang quet ca
 * noi dung, nen khong the cho tung bai tai rieng khi go.
 */
const BODY_MODULES = import.meta.glob('../content/guide/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const GUIDE_BODIES: Record<string, string> = Object.fromEntries(
  Object.entries(BODY_MODULES).map(([file, body]) => [
    file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/, ''),
    body,
  ])
);

export function guideBody(slug: string): string {
  return GUIDE_BODIES[slug] ?? '';
}

export interface GuideHit {
  article: GuideArticle;
  /** Mot dong trich tu than bai, de nguoi tim biet vi sao bai nay khop. */
  snippet: string;
}

/* Bo cu phap Markdown de doan trich doc nhu mot cau, khong phai nhu ma nguon. */
function plainLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tim trong than bai: tra ve dong khop tot nhat va diem cua no.
 *
 * Doi moi tu nam tren CUNG MOT DONG chu khong phai rai rac ca bai. Tieng Viet
 * bo dau co rat nhieu tu ngan trung nhau ("no", "cong", "ban"), nen "cac tu deu
 * xuat hien o dau do trong bai" gan nhu bai nao cung dung — go "cong no" ma ra
 * ba phan tu so bai thi o tim khong giup duoc gi.
 */
function bodyMatch(body: string, words: string[], phrase: string) {
  let best: { score: number; line: string } | null = null;
  for (const raw of body.split('\n')) {
    const line = plainLine(raw);
    if (line.length <= 24) continue;
    const folded = foldVietnamese(line);
    if (!words.every((word) => folded.includes(word))) continue;
    /* Dung nguyen cum thi gan chac la y nguoi tim; cac tu roi rac thi kem hon. */
    const score = folded.includes(phrase) ? 2 : 3;
    if (!best || score < best.score) best = { score, line };
    if (score === 2) break;
  }
  return best;
}

/**
 * Tim bai huong dan theo cum tu nguoi dung go, khong phan biet dau.
 *
 * Xep hang: khop tieu de truoc, roi den tom tat va tu khoa, roi den nguyen cum
 * trong than bai, cuoi cung la cac tu roi rac tren mot dong — nguoi go "doanh
 * thu" muon bai Doanh thu dung dau chu khong phai mot bai co nhac den tu do.
 */
export function searchGuide(articles: GuideArticle[], term: string): GuideHit[] {
  const phrase = foldVietnamese(term).replace(/\s+/g, ' ').trim();
  const words = phrase.split(' ').filter(Boolean);
  if (words.length === 0) return articles.map((article) => ({ article, snippet: '' }));

  const hits: { hit: GuideHit; score: number }[] = [];
  for (const article of articles) {
    const title = foldVietnamese(article.title);
    const meta = articleMeta(article);
    const inMeta = words.every((word) => meta.includes(word));
    const found = bodyMatch(guideBody(article.slug), words, phrase);
    if (!inMeta && !found) continue;

    const score = words.every((word) => title.includes(word))
      ? 0
      : inMeta
        ? 1
        : (found?.score ?? 3);

    /* Chi bai khop nho than bai moi can doan trich: ten va tom tat da tu giai
       thich vi sao bai khop. */
    const line = score >= 2 ? (found?.line ?? '') : '';
    const snippet = line.length > 160 ? `${line.slice(0, 160)}…` : line;
    hits.push({ hit: { article, snippet }, score });
  }
  return hits.sort((a, b) => a.score - b.score).map((entry) => entry.hit);
}
