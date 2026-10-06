import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText, mailtoHref, shareMessage, telegramHref } from './share';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shareMessage', () => {
  it('tao loi nhan khong kem thong tin mat khau', () => {
    expect(shareMessage('Báo giá Đà Nẵng & Q4', 'https://example.com/share?a=1&b=2', false)).toBe(
      'Xin chào, mình chia sẻ "Báo giá Đà Nẵng & Q4" để bạn xem:\n' +
        'https://example.com/share?a=1&b=2'
    );
  });

  it('them thong tin mat khau khi lien ket duoc bao ve', () => {
    expect(shareMessage('Hợp đồng', 'https://example.com/share/abc', true)).toBe(
      'Xin chào, mình chia sẻ "Hợp đồng" để bạn xem:\n' +
        'https://example.com/share/abc\n' +
        '(Mật khẩu mở liên kết mình sẽ gửi riêng.)'
    );
  });
});

describe('mailtoHref', () => {
  it('ma hoa tieu de, noi dung tieng Viet va dau &', () => {
    const title = 'Báo giá Đà Nẵng & Q4';
    const url = 'https://example.com/share?a=1&b=2';
    const message = shareMessage(title, url, false);

    expect(mailtoHref(title, url, false)).toBe(
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`
    );
  });
});

describe('telegramHref', () => {
  it('ma hoa URL va tieu de tieng Viet co dau &', () => {
    const title = 'Báo giá Đà Nẵng & Q4';
    const url = 'https://example.com/share?a=1&b=2';

    expect(telegramHref(title, url, false)).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`
    );
  });

  it('them thong tin mat khau vao tieu de khi lien ket duoc bao ve', () => {
    const title = 'Hợp đồng & phụ lục';
    const url = 'https://example.com/share/abc';
    const text = `${title} (mật khẩu mở liên kết sẽ gửi riêng)`;

    expect(telegramHref(title, url, true)).toBe(
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    );
  });
});

describe('copyText', () => {
  it('sao chep thanh cong qua clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('Nội dung cần sao chép')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('Nội dung cần sao chép');
  });

  it('lui ve execCommand va go textarea khoi DOM khi clipboard loi', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Clipboard unavailable'));
    const textarea = {
      value: '',
      style: {},
      select: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLTextAreaElement;
    const appendChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    const documentMock = {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild },
      execCommand,
    } as unknown as Document;

    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('document', documentMock);

    await expect(copyText('Nội dung dự phòng')).resolves.toBe(true);
    expect(documentMock.createElement).toHaveBeenCalledWith('textarea');
    expect(textarea.value).toBe('Nội dung dự phòng');
    expect(appendChild).toHaveBeenCalledWith(textarea);
    expect(textarea.select).toHaveBeenCalledOnce();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
  });
});
