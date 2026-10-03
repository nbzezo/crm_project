/*
 * Link nhac cua nguoi dung cho man cho (1.14.1).
 *
 * Nhan ba loai, deu phat bang trinh phat NHUNG cua chinh dich vu (hoac the <audio>
 * voi radio), nen khong tai nhac ve may chu va khong dinh ban quyen:
 * - YouTube: video, danh sach phat, livestream (youtube.com, youtu.be, music.youtube.com);
 * - Spotify: bai hat, album, danh sach phat, podcast;
 * - Radio internet: duong dan thang toi luong am thanh (mp3, aac, m3u8 khong ho tro).
 *
 * Danh sach luu trong localStorage cua TUNG MAY, giong anh nen.
 */

export type MusicLinkKind = 'youtube' | 'spotify' | 'stream';

export interface MusicLink {
  id: string;
  kind: MusicLinkKind;
  title: string;
  /** Dia chi nhung iframe (youtube/spotify) hoac dia chi luong am thanh (stream). */
  src: string;
  /** Link nguoi dung da dan, de mo ra hoac hien lai. */
  url: string;
}

const LINKS_KEY = 'workflow.lock.music.links.v1';
const MAX_LINKS = 20;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);
const AUDIO_EXT = /\.(mp3|aac|ogg|opus|wav|m4a|flac)(\?|$)/i;
const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]{10,64}$/;
const SPOTIFY_TYPES = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);

function youtubeSrc(url: URL): string | null {
  const list = url.searchParams.get('list');
  const validList = list && PLAYLIST_ID.test(list) ? list : null;
  let video: string | null = null;
  if (url.hostname === 'youtu.be') video = url.pathname.split('/')[1] ?? null;
  else if (url.pathname === '/watch') video = url.searchParams.get('v');
  else {
    const [, kind, id] = url.pathname.split('/');
    if (kind === 'live' || kind === 'embed' || kind === 'shorts') video = id ?? null;
  }
  const base = 'https://www.youtube-nocookie.com/embed';
  const params = 'autoplay=1&playsinline=1&rel=0';
  if (video && VIDEO_ID.test(video)) {
    return `${base}/${video}?${params}${validList ? `&list=${validList}&loop=1` : ''}`;
  }
  if (validList) return `${base}/videoseries?list=${validList}&${params}`;
  return null;
}

function spotifySrc(url: URL): string | null {
  /* /intl-vi/playlist/ID  hoac  /playlist/ID  hoac  /embed/playlist/ID */
  const parts = url.pathname.split('/').filter(Boolean);
  const at = parts.findIndex((part) => SPOTIFY_TYPES.has(part));
  const type = parts[at];
  const id = parts[at + 1];
  if (at < 0 || !id || !/^[A-Za-z0-9]{10,32}$/.test(id)) return null;
  return `https://open.spotify.com/embed/${type}/${id}?theme=0`;
}

/** Nhan dien link; tra ve null khi khong phai link nhac duoc ho tro. */
export function parseMusicLink(input: string, title?: string): Omit<MusicLink, 'id'> | null {
  const text = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const name = title?.trim();

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    const src = youtubeSrc(url);
    return src ? { kind: 'youtube', title: name || 'YouTube', src, url: url.href } : null;
  }
  if (url.hostname === 'open.spotify.com') {
    const src = spotifySrc(url);
    return src ? { kind: 'spotify', title: name || 'Spotify', src, url: url.href } : null;
  }
  /* Radio: chi nhan khi nhin la luong am thanh, de khong nhet trang web bat ky vao the <audio>. */
  if (
    AUDIO_EXT.test(url.pathname + url.search) ||
    /stream|radio|listen|icecast|live/i.test(url.hostname)
  ) {
    return { kind: 'stream', title: name || url.hostname, src: url.href, url: url.href };
  }
  return null;
}

export function readMusicLinks(): MusicLink[] {
  try {
    const value = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '[]') as MusicLink[];
    return Array.isArray(value) ? value.filter((item) => item?.id && item.src && item.kind) : [];
  } catch {
    return [];
  }
}

export function writeMusicLinks(links: MusicLink[]): void {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(links.slice(0, MAX_LINKS)));
  } catch {
    // Khong luu duoc thi danh sach chi song trong phien nay.
  }
}

export function newMusicLinkId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
