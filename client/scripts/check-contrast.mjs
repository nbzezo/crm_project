import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Kiem tra ty le tuong phan WCAG AA cho cac cap token mau x be mat, tren TUNG theme.
 *
 * Vi sao can bai nay du da co axe trong e2e: axe chi thay nhung gi dang hien tren
 * man hinh no vua mo, nen mot token chi dung o mot man it ghe qua se khong bao gio
 * duoc do. Bai nay do thang tren bang mau nen khong phu thuoc vao viec route nao
 * duoc quet.
 *
 * Bai nay cung tu xu ly dung hai thu ma mot script do tuong phan ngay tho hay sai:
 *  - NEN TRONG SUOT: `--tr-nav-panel` la rgba, phai tron voi nen phia sau roi moi
 *    do. Doc thang gia tri rgba ra roi coi nhu mau dac se cho so vo nghia.
 *  - NEN LA GRADIENT: `.tr-app-shell` to bang `linear-gradient`, khong co
 *    `background-color`. Mot script chi doc `backgroundColor` se thay "trong
 *    suot" roi roi xuyen xuong `--tr-page-bg` (#a7adb8 — xam xanh, toi hon han)
 *    va bao sai hang loat loi. Day chinh la nguon goc cua "30 vi pham theme
 *    Sang" trong ban ra soat 18/09/2026: do `--tr-muted` (#68665f) tren
 *    #a7adb8 ra 2,55:1, trong khi tren nen that no dat 4,5-5,5:1.
 *    O day ta do tren TUNG diem dung mau cua gradient va lay diem xau nhat.
 */

const AA_NORMAL = 4.5;
const cssPath = path.resolve('client/src/index.css');

/* Cac theme va selector dinh nghia chung. Theme khong khai bao lai mot token thi
   ke thua gia tri o `:root`, dung nhu CSS cascade. */
const THEMES = [
  { name: 'Sáng', selector: ':root' },
  { name: 'Tối', selector: "[data-theme='dark']" },
  { name: 'Zoho CRM', selector: "[data-theme='zoho']" },
  { name: 'Ubuntu 26', selector: "[data-theme='ubuntu']" },
];

/** Muc chu x be mat can dat AA. */
const TEXT_TOKENS = ['--tr-text', '--tr-subtle', '--tr-muted'];
const SOLID_SURFACES = ['--tr-panel', '--tr-surface', '--tr-list'];

/**
 * Muc chu thanh ben nam tren mot lop panel BAN TRONG SUOT, lop do lai nam tren
 * shell gradient — phai tron ca hai lop roi moi do.
 */
const LAYERED = [{ fg: '--tr-nav-text', over: ['--tr-nav-panel'], base: '--tr-shell-gradient' }];

/**
 * Mau ngu nghia con duoc dung LAM MUC CHU tren chinh no pha loang 10% — cac the
 * trang thai kieu `bg-tr-warning/10 text-tr-warning` ("Tốt", "Cần chú ý", "Rủi
 * ro"). Day la cap de lot nhat: nhin rieng token thi dat, nhung nen lai chinh la
 * no nen ty le that thap hon han.
 */
const TINTED = ['--tr-danger', '--tr-success', '--tr-warning', '--tr-primary'];
/* Hai muc pha loang that su duoc dung trong ma nguon: `/10` va `/15`. Muc `/15`
   nhat hon nen kho hon o theme toi — phai kiem ca hai. */
const TINT_ALPHAS = [0.1, 0.15];

function parseBlocks(css) {
  const blocks = new Map();
  for (const { selector } of THEMES) {
    // Lay khoi dau tien mo bang selector nay.
    const at = css.indexOf(`${selector} {`);
    if (at === -1) continue;
    const start = css.indexOf('{', at);
    const end = css.indexOf('\n}', start);
    const body = css.slice(start + 1, end);
    const tokens = new Map();
    for (const line of body.split('\n')) {
      const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
      if (m) tokens.set(m[1], m[2].trim());
    }
    blocks.set(selector, tokens);
  }
  return blocks;
}

function tokenValue(blocks, selector, token) {
  return blocks.get(selector)?.get(token) ?? blocks.get(':root')?.get(token);
}

/** '#rgb' | '#rrggbb' | 'rgba(r,g,b,a)' -> {r,g,b,a} */
function parseColor(value) {
  if (!value) return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split('')
            .map((c) => c + c)
            .join('')
        : h;
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    };
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(',').map((p) => Number(p.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  return null;
}

/**
 * Tat ca diem dung mau cua mot gia tri gradient.
 *
 * Nhanh 6 ky tu phai dat TRUOC nhanh 3 ky tu: regex thu cac nhanh theo thu tu
 * viet, nen `{3}|{6}` se an "#e5e" tu "#e5e5e6" roi dung lai — ra mau hoan toan
 * khac (#ee55ee) va moi ty le do sau do deu vo nghia.
 */
function gradientStops(value) {
  return (value?.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})/gi) ?? []).map(parseColor).filter(Boolean);
}

/** Tron `top` (co alpha) len `bottom` (dac). */
function flatten(top, bottom) {
  if (top.a >= 1) return { ...top, a: 1 };
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const css = await readFile(cssPath, 'utf8');
const blocks = parseBlocks(css);
const findings = [];

function check(themeName, label, fg, bg) {
  const value = ratio(fg, bg);
  if (value < AA_NORMAL) {
    findings.push(`${themeName} · ${label} — ${value.toFixed(2)}:1 (cần ≥ ${AA_NORMAL})`);
  }
}

for (const { name, selector } of THEMES) {
  const surfaces = [];
  for (const token of SOLID_SURFACES) {
    const color = parseColor(tokenValue(blocks, selector, token));
    if (color) surfaces.push({ label: token, color });
  }
  // Nen that phia sau vung noi dung la shell gradient, khong phai --tr-page-bg.
  gradientStops(tokenValue(blocks, selector, '--tr-shell-gradient')).forEach((color, index) => {
    surfaces.push({ label: `--tr-shell-gradient[${index}]`, color });
  });

  for (const textToken of TEXT_TOKENS) {
    const fg = parseColor(tokenValue(blocks, selector, textToken));
    if (!fg) continue;
    for (const surface of surfaces) {
      check(name, `${textToken} trên ${surface.label}`, fg, surface.color);
    }
  }

  for (const token of TINTED) {
    const fg = parseColor(tokenValue(blocks, selector, token));
    const panel = parseColor(tokenValue(blocks, selector, '--tr-panel'));
    if (!fg || !panel) continue;
    for (const alpha of TINT_ALPHAS) {
      const tint = flatten({ ...fg, a: alpha }, panel);
      check(name, `${token} trên nền ${token}/${alpha * 100}`, fg, tint);
    }
  }

  for (const layer of LAYERED) {
    const fg = parseColor(tokenValue(blocks, selector, layer.fg));
    if (!fg) continue;
    const bases = gradientStops(tokenValue(blocks, selector, layer.base));
    for (const [index, base] of bases.entries()) {
      let bg = base;
      for (const overToken of layer.over) {
        const over = parseColor(tokenValue(blocks, selector, overToken));
        if (over) bg = flatten(over, bg);
      }
      check(name, `${layer.fg} trên ${layer.over.join('+')}[${index}]`, fg, bg);
    }
  }
}

if (findings.length > 0) {
  console.error(`Contrast guard phát hiện ${findings.length} vấn đề:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Contrast guard: OK');
}
