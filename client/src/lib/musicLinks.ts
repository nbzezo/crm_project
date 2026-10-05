/*
 * Link nhac cua nguoi dung cho man cho (1.14.1).
 *
 * Nhan ba loai, deu phat bang trinh phat NHUNG cua chinh dich vu (hoac the <audio>
 * voi radio), nen khong tai nhac ve may chu va khong dinh ban quyen:
 * - YouTube: video, danh sach phat, livestream (youtube.com, youtu.be, music.youtube.com);
 * - Spotify: bai hat, album, danh sach phat, podcast;
 * - Radio internet: duong dan thang toi luong am thanh (mp3, aac, m3u8 khong ho tro).
 *
 * Tu 1.20.0 link yeu thich luu tren may chu theo tai khoan (/api/music-links). May chu
 * chi giu link goc + ten; dia chi nhung luon dung lai o day bang parseMusicLink, nen
 * link nao khong nhan ra thi khong phat. Danh sach cu trong localStorage (1.14.1) chi
 * con doc mot lan de chuyen len may chu.
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

/** Danh sach cu luu theo may (1.14.1–1.19.x), chi doc de chuyen len may chu. */
const LEGACY_LINKS_KEY = 'workflow.lock.music.links.v1';

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

/** Link yeu thich may chu tra ve. */
export interface SavedMusicLink {
  id: number;
  title: string;
  url: string;
  created_at: string;
}

/** Dung lai link phat duoc tu ban luu; null khi link khong (con) duoc ho tro. */
export function linkFromSaved(saved: SavedMusicLink): MusicLink | null {
  const parsed = parseMusicLink(saved.url, saved.title);
  return parsed ? { ...parsed, id: `saved-${saved.id}` } : null;
}

export function readLegacyMusicLinks(): Pick<MusicLink, 'title' | 'url'>[] {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_LINKS_KEY) ?? '[]') as MusicLink[];
    return Array.isArray(value)
      ? value
          .filter((item) => typeof item?.url === 'string' && typeof item.title === 'string')
          .map((item) => ({ title: item.title, url: item.url }))
      : [];
  } catch {
    return [];
  }
}

export function clearLegacyMusicLinks(): void {
  try {
    localStorage.removeItem(LEGACY_LINKS_KEY);
  } catch {
    // Khong xoa duoc thi lan sau chuyen lai; may chu gop link trung nen khong sinh dong thua.
  }
}

export function newMusicLinkId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
