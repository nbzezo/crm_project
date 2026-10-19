// The client tsconfig intentionally omits Node types; Vitest runs this file in Node.
// @ts-expect-error Node types are not part of the browser application bundle.
import fs from 'node:fs';
// @ts-expect-error Node types are not part of the browser application bundle.
import path from 'node:path';
// @ts-expect-error Node types are not part of the browser application bundle.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GUIDE_ARTICLES,
  GUIDE_CHAPTERS,
  GUIDE_HOME_SLUG,
  ROUTE_TO_ARTICLE,
  articleForRoute,
  searchGuideMeta,
  visibleGuideArticles,
} from './guideNav';
import { GUIDE_BODIES, searchGuide } from './guideBodies';

/*
 * Chot chan cho tai lieu huong dan.
 *
 * Noi dung la van ban nen khong co tsc nao bat duoc loi o day: mot bai thieu
 * file .md, mot anh doi ten, mot bai lot ra ngoai muc luc — tat ca chi vo ra
 * khi nguoi dung mo trang. Nhung kiem tra duoi day dung thay cho viec do.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(here, '../content/guide');
const IMG_DIR = path.resolve(here, '../../public/guide/img');

const slugs = GUIDE_ARTICLES.map((article) => article.slug);
const files = fs.existsSync(CONTENT_DIR)
  ? fs
      .readdirSync(CONTENT_DIR)
      .filter((name: string) => name.endsWith('.md'))
      .map((name: string) => name.replace(/\.md$/, ''))
  : [];

describe('danh muc bai huong dan', () => {
  it('slug khong trung va khong dau', () => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('moi bai co dung mot file .md, va khong co file .md nao lot ngoai muc luc', () => {
    expect([...slugs].sort()).toEqual([...files].sort());
  });

  it('than bai nap duoc va khong rong', () => {
    for (const slug of slugs) {
      expect(GUIDE_BODIES[slug], `thieu than bai: ${slug}`).toBeTruthy();
      expect((GUIDE_BODIES[slug] ?? '').trim().length).toBeGreaterThan(80);
    }
  });

  /* Tieu de chuong chi ve o bai DAU TIEN cua chuong (xem GuidePage): cac bai cung
     chuong nam roi rac se lam muc luc hien hai lan mot tieu de. */
  it('cac bai cung chuong nam lien nhau', () => {
    const seen: string[] = [];
    for (const article of GUIDE_ARTICLES) {
      if (seen[seen.length - 1] !== article.chapter) {
        expect(seen, `chuong bi tach doi: ${article.chapter}`).not.toContain(article.chapter);
        seen.push(article.chapter);
      }
    }
  });

  it('chuong nao cung co bai', () => {
    const used = new Set(GUIDE_ARTICLES.map((article) => article.chapter));
    for (const chapter of Object.values(GUIDE_CHAPTERS)) expect(used).toContain(chapter);
  });
});

describe('anh minh hoa', () => {
  it('moi anh duoc nhac trong bai deu co that', () => {
    const missing: string[] = [];
    for (const [slug, body] of Object.entries(GUIDE_BODIES)) {
      for (const match of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
        const src = match[1];
        if (!src.startsWith('/guide/img/')) {
          missing.push(`${slug}: ${src} (anh huong dan phai nam trong /guide/img/)`);
          continue;
        }
        const file = path.join(IMG_DIR, src.slice('/guide/img/'.length));
        if (!fs.existsSync(file)) missing.push(`${slug}: ${src}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('moi anh da chup deu duoc dung o dau do', () => {
    if (!fs.existsSync(IMG_DIR)) return;
    const referenced = new Set(
      Object.values(GUIDE_BODIES).flatMap((body) =>
        [...body.matchAll(/!\[[^\]]*\]\(\/guide\/img\/([^)\s]+)/g)].map((match) => match[1])
      )
    );
    const unused = fs
      .readdirSync(IMG_DIR)
      .filter((name: string) => /\.(png|jpe?g|svg|webp)$/i.test(name))
      .filter((name: string) => !referenced.has(name));
    expect(unused).toEqual([]);
  });

  it('moi anh deu co loi chu thich — `alt` la chu thich hien duoi anh', () => {
    const silent: string[] = [];
    for (const [slug, body] of Object.entries(GUIDE_BODIES)) {
      for (const match of body.matchAll(/!\[([^\]]*)\]\(/g)) {
        if (match[1].trim().length < 8) silent.push(`${slug}: ![${match[1]}]`);
      }
    }
    expect(silent).toEqual([]);
  });
});

describe('tim kiem', () => {
  const all = visibleGuideArticles(() => true);

  it('go khong dau van ra bai', () => {
    expect(searchGuideMeta(all, 'cong viec')[0]?.slug).toBe('cong-viec');
    expect(searchGuideMeta(all, 'DOANH THU')[0]?.slug).toBe('doanh-thu');
    expect(searchGuideMeta(all, 'phan quyen').map((a) => a.slug)).toContain('qt-phan-quyen');
  });

  it('cum tu vo nghia khong ra gi', () => {
    expect(searchGuideMeta(all, 'zzzz khong co gi')).toEqual([]);
    expect(searchGuide(all, 'zzzz khong co gi')).toEqual([]);
  });

  it('tu chi nam trong than bai van tim duoc, va co doan trich', () => {
    /* Lay mot tu that trong mot bai that thay vi hard-code: bai viet lai thi
       kiem tra nay van co nghia. */
    const body = GUIDE_BODIES['phim-tat'] ?? '';
    expect(body).toContain('Ctrl');
    const hits = searchGuide(all, 'ctrl');
    expect(hits.map((hit) => hit.article.slug)).toContain('phim-tat');
  });

  it('bai bi khoa theo quyen thi nguoi khong co quyen khong thay', () => {
    const limited = visibleGuideArticles((key) => key === undefined);
    expect(limited.map((a) => a.slug)).not.toContain('qt-phan-quyen');
    expect(limited.map((a) => a.slug)).toContain(GUIDE_HOME_SLUG);
  });
});

describe('nut tro giup theo ngo canh', () => {
  it('moi duong dan khai bao deu tro toi mot bai co that', () => {
    for (const entry of ROUTE_TO_ARTICLE) expect(slugs).toContain(entry.slug);
    expect(slugs).toContain(GUIDE_HOME_SLUG);
  });

  it('duong dan con lay bai cua duong dan cha', () => {
    expect(articleForRoute('/deals/12')).toBe('co-hoi');
    expect(articleForRoute('/customers')).toBe('khach-hang');
  });

  /* /pipeline-health phai thang /pipeline du ca hai cung la tien to khop. */
  it('tien to dai hon thang', () => {
    expect(articleForRoute('/pipeline-health')).toBe('suc-khoe-pipeline');
    expect(articleForRoute('/pipeline')).toBe('co-hoi');
  });

  it('duong dan chua khai bao thi mo bai mo dau', () => {
    expect(articleForRoute('/khong-co-duong-nay')).toBe(GUIDE_HOME_SLUG);
  });
});
