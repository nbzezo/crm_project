import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { HttpError } from '../lib/validate.ts';

/*
 * Xem truoc link dan vao bai viet / binh luan (Bang tin). May chu tai trang roi doc
 * the Open Graph — nen phai chan SSRF: chi http/https cong mac dinh, KHONG cho dia chi
 * noi bo (loopback, mang LAN, link-local, metadata dam may...). Kiem tra dia chi ngay
 * trong ham `lookup` cua socket nen DNS doi dia chi giua chung (rebinding) cung bi chan;
 * moi lan chuyen huong deu kiem tra lai.
 */

export interface LinkPreview {
  url: string;
  site: string;
  title: string | null;
  description: string | null;
  image: string | null;
}

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;

/** Dia chi khong duoc phep goi toi: noi bo, dac biet, multicast. */
export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower) ||
      lower.startsWith('ff') ||
      lower.startsWith('64:ff9b:') ||
      lower.startsWith('2001:db8')
    );
  }
  return true;
}

/** Chuan hoa va kiem tra URL nguoi dung dua vao. */
export function parsePreviewUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new HttpError(400, 'Đường dẫn không hợp lệ');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Chỉ xem trước được link http/https');
  }
  if (url.username || url.password) throw new HttpError(400, 'Đường dẫn không hợp lệ');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new HttpError(400, 'Không xem trước được link này');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && isBlockedAddress(host)) {
    throw new HttpError(400, 'Không xem trước được link này');
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new HttpError(400, 'Không xem trước được link này');
  }
  url.hash = '';
  return url;
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 4);
    const list = addresses as dns.LookupAddress[];
    const allowed = list.filter((entry) => !isBlockedAddress(entry.address));
    if (allowed.length === 0 || allowed.length !== list.length) {
      return callback(Object.assign(new Error('Blocked address'), { code: 'EBLOCKED' }), '', 4);
    }
    if ((options as dns.LookupOptions).all) return callback(null, allowed as never, 4);
    callback(null, allowed[0].address, allowed[0].family);
  });
};

function fetchHtml(url: URL, redirects = 0): Promise<{ url: URL; html: string }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; WorkFlowLinkPreview/1.0)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'vi,en;q=0.8',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'));
          try {
            const next = parsePreviewUrl(new URL(response.headers.location, url).toString());
            fetchHtml(next, redirects + 1).then(resolve, reject);
          } catch {
            reject(new Error('Blocked redirect'));
          }
          return;
        }
        const type = String(response.headers['content-type'] ?? '');
        if (status >= 400 || !/text\/html|application\/xhtml/i.test(type)) {
          response.resume();
          return reject(new Error(`Not HTML (${status})`));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          const buffer = Buffer.concat(chunks);
          const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase();
          let html: string;
          try {
            html = new TextDecoder(charset ?? 'utf-8').decode(buffer);
          } catch {
            html = buffer.toString('utf8');
          }
          resolve({ url, html });
        };
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          /* Chi can phan <head>: du dung luong thi dung, khong tai het trang. */
          if (size >= MAX_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on('end', finish);
        response.on('error', reject);
      }
    );
    request.on('timeout', () => request.destroy(new Error('Timeout')));
    request.on('error', reject);
  });
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const MARKS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  circ: '̂',
  tilde: '̃',
  uml: '̈',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const value =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value < 0x110000
        ? String.fromCodePoint(value)
        : whole;
    }
    const named = ENTITIES[code.toLowerCase()];
    if (named) return named;
    /* &aacute; &ecirc; &otilde;...: chu cai + dau ghep, chuan hoa NFC. */
    const accent = /^([a-z])(acute|grave|circ|tilde|uml)$/i.exec(code);
    return accent ? (accent[1] + MARKS[accent[2]]).normalize('NFC') : whole;
  });
}

function clean(text: string | undefined, max: number): string | null {
  if (!text) return null;
  const value = decodeEntities(text).replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Doc tieu de, mo ta, anh tu the meta (Open Graph, Twitter) hoac <title>. */
export function extractPreview(html: string, pageUrl: URL): LinkPreview {
  const head = html.slice(0, MAX_BYTES);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
        .exec(tag)
        ?.slice(1)
        .find((v) => v !== undefined);
    const key = (attr('property') ?? attr('name'))?.toLowerCase();
    const content = attr('content');
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const rawImage = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image');
  let image: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), pageUrl);
      if (resolved.protocol === 'https:' || resolved.protocol === 'http:') {
        image = resolved.toString();
      }
    } catch {
      image = null;
    }
  }
  return {
    url: pageUrl.toString(),
    site: clean(meta.get('og:site_name'), 80) ?? pageUrl.hostname.replace(/^www\./, ''),
    title: clean(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 200),
    description: clean(
      meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description'),
      300
    ),
    image,
  };
}

const cache = new Map<string, { at: number; value: LinkPreview | null }>();

/** Xem truoc mot link; null khi trang khong tai duoc hoac khong phai HTML. */
export async function getLinkPreview(raw: string): Promise<LinkPreview | null> {
  const url = parsePreviewUrl(raw);
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  let value: LinkPreview | null;
  try {
    const page = await fetchHtml(url);
    value = extractPreview(page.html, page.url);
    if (!value.title && !value.description && !value.image) value = null;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    value = null;
  }
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return value;
}
