import { describe, expect, it } from 'vitest';
import { parseMusicLink } from './musicLinks';

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
