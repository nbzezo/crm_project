import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLegacyMusicLinks,
  linkFromSaved,
  parseMusicLink,
  readLegacyMusicLinks,
} from './musicLinks';

describe('parseMusicLink', () => {
  it('nhan YouTube dang watch, youtu.be, live va playlist', () => {
    const watch = parseMusicLink('https://www.youtube.com/watch?v=jfKfPfyJRdk');
    expect(watch).toMatchObject({ kind: 'youtube' });
    expect(watch?.src).toContain('youtube-nocookie.com/embed/jfKfPfyJRdk');
    expect(parseMusicLink('https://youtu.be/jfKfPfyJRdk?si=abc')?.src).toContain(
      '/embed/jfKfPfyJRdk'
    );
    expect(parseMusicLink('https://www.youtube.com/live/jfKfPfyJRdk')?.src).toContain(
      '/embed/jfKfPfyJRdk'
    );
    const list = parseMusicLink('https://www.youtube.com/playlist?list=PLabcdefghij123');
    expect(list?.src).toContain('videoseries?list=PLabcdefghij123');
  });

  it('thieu http van nhan va giu ten do nguoi dung dat', () => {
    expect(parseMusicLink('youtu.be/jfKfPfyJRdk', 'Lofi 24/7')).toMatchObject({
      kind: 'youtube',
      title: 'Lofi 24/7',
    });
  });

  it('nhan Spotify ke ca duong dan co ma ngon ngu', () => {
    expect(
      parseMusicLink('https://open.spotify.com/intl-vi/playlist/37i9dQZF1DX8Uebhn9wzrS?si=x')?.src
    ).toBe('https://open.spotify.com/embed/playlist/37i9dQZF1DX8Uebhn9wzrS?theme=0');
    expect(parseMusicLink('https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy')?.kind).toBe(
      'spotify'
    );
  });

  it('nhan luong radio la tep am thanh, tu choi trang web thuong', () => {
    expect(parseMusicLink('https://stream.example.com/lofi.mp3')).toMatchObject({ kind: 'stream' });
    expect(parseMusicLink('https://example.com/bai-viet')).toBeNull();
  });

  it('tu choi chuoi rac, link YouTube khong co video, giao thuc la', () => {
    expect(parseMusicLink('khong phai link')).toBeNull();
    expect(parseMusicLink('https://www.youtube.com/')).toBeNull();
    expect(parseMusicLink('javascript:alert(1)')).toBeNull();
    expect(parseMusicLink('https://youtube.com.evil.test/watch?v=jfKfPfyJRdk')).toBeNull();
  });
});

describe('link yeu thich luu tren may chu', () => {
  const saved = { id: 7, title: 'Lofi', created_at: '2026-10-05 08:00:00' };

  it('dung lai dia chi nhung tu link goc, khong tin dia chi tu may chu', () => {
    const link = linkFromSaved({ ...saved, url: 'https://youtu.be/jfKfPfyJRdk' });
    expect(link).toMatchObject({ id: 'saved-7', kind: 'youtube', title: 'Lofi' });
    expect(link?.src).toContain('youtube-nocookie.com/embed/jfKfPfyJRdk');
  });

  it('link khong con nhan ra thi bo qua thay vi nhung trang la', () => {
    expect(linkFromSaved({ ...saved, url: 'https://example.com/bai-viet' })).toBeNull();
  });
});

describe('danh sach cu trong localStorage', () => {
  const KEY = 'workflow.lock.music.links.v1';
  /* Test chay trong Node, khong co localStorage that. */
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('doc ten + link de chuyen len may chu, roi xoa', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'a', kind: 'youtube', title: 'Lofi', src: 'x', url: 'https://youtu.be/jfKfPfyJRdk' },
        { id: 'b', title: 42 },
      ])
    );
    expect(readLegacyMusicLinks()).toEqual([
      { title: 'Lofi', url: 'https://youtu.be/jfKfPfyJRdk' },
    ]);
    clearLegacyMusicLinks();
    expect(readLegacyMusicLinks()).toEqual([]);
  });

  it('du lieu hong thi coi nhu rong', () => {
    localStorage.setItem(KEY, '{khong phai json');
    expect(readLegacyMusicLinks()).toEqual([]);
  });
});
