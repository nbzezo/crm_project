import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../components/music/ambient', () => ({
  playAmbient: vi.fn(),
  stopAmbient: vi.fn(),
}));

const ambient = await import('../components/music/ambient');
const { useMusicStore } = await import('./musicStore');

const lofi = {
  id: 'a',
  kind: 'youtube' as const,
  title: 'Lofi',
  src: 'https://www.youtube-nocookie.com/embed/jfKfPfyJRdk',
  url: 'https://youtu.be/jfKfPfyJRdk',
};

describe('musicStore: mot trinh phat cho man cho va man lam viec', () => {
  beforeEach(() => {
    useMusicStore.setState({ link: null, ambient: null, slots: [] });
    vi.clearAllMocks();
  });

  it('phat link thi tat am thanh tao san, va nguoc lai', () => {
    useMusicStore.getState().playAmbient('rain');
    expect(ambient.playAmbient).toHaveBeenCalledWith('rain');
    expect(useMusicStore.getState().ambient).toBe('rain');

    useMusicStore.getState().playLink(lofi);
    expect(ambient.stopAmbient).toHaveBeenCalled();
    expect(useMusicStore.getState()).toMatchObject({ link: lofi, ambient: null });

    useMusicStore.getState().playAmbient('lofi');
    expect(useMusicStore.getState()).toMatchObject({ link: null, ambient: 'lofi' });
  });

  it('dung thi tat ca hai', () => {
    useMusicStore.getState().playLink(lofi);
    useMusicStore.getState().stop();
    expect(useMusicStore.getState()).toMatchObject({ link: null, ambient: null });
  });

  it('o phat mo sau cung duoc dung; dong o thi quay ve o truoc', () => {
    /* Test chay trong Node: o chi can la mot doi tuong rieng biet. */
    const lockSlot = {} as HTMLElement;
    const popoverSlot = {} as HTMLElement;
    const { addSlot, removeSlot } = useMusicStore.getState();
    addSlot(lockSlot);
    addSlot(popoverSlot);
    expect(useMusicStore.getState().slots.at(-1)).toBe(popoverSlot);
    removeSlot(popoverSlot);
    expect(useMusicStore.getState().slots).toEqual([lockSlot]);
  });
});
