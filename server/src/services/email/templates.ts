import type { MailMessage } from './emailService.ts';

/*
 * Noi dung cac thu he thong gui (moi, dat lai mat khau, ma khoa man hinh). Giu o
 * day de sua chu khong phai mo route ra, va de tat ca dung chung mot khung HTML.
 *
 * Moi thu deu co ban `text` day du — mot so may khach hang doc thu noi bo chan
 * HTML, va lien ket dat lai mat khau ma khong bam duoc thi coi nhu thu bo di.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, bodyHtml: string, link: string, cta: string): string {
  return `<!doctype html>
<html lang="vi"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#172b4d">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="margin:24px 0">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#0052cc;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${escapeHtml(cta)}</a>
    </p>
    <p style="margin:16px 0 0;font-size:13px;color:#5e6c84">
      Nút không bấm được? Dán liên kết này vào trình duyệt:<br>
      <span style="word-break:break-all">${escapeHtml(link)}</span>
    </p>
  </div>
</body></html>`;
}

export function inviteEmail(to: string, fullName: string, link: string): MailMessage {
  const greeting = fullName ? `Chào ${fullName},` : 'Xin chào,';
  return {
    to,
    subject: 'Kích hoạt tài khoản WorkFlow của bạn',
    text:
      `${greeting}\n\n` +
      `Một tài khoản WorkFlow đã được tạo cho bạn. Đặt mật khẩu tại liên kết dưới đây:\n\n` +
      `${link}\n\n` +
      `Liên kết có hiệu lực trong 7 ngày và chỉ dùng được một lần.\n` +
      `Nếu bạn không chờ đợi thư này, hãy bỏ qua nó.\n`,
    html: layout(
      'Kích hoạt tài khoản WorkFlow',
      `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
       <p style="margin:0">Một tài khoản WorkFlow đã được tạo cho bạn. Bấm nút dưới đây để đặt mật khẩu.
       Liên kết có hiệu lực trong <strong>7 ngày</strong> và chỉ dùng được một lần.</p>`,
      link,
      'Đặt mật khẩu'
    ),
  };
}

export function resetEmail(to: string, fullName: string, link: string): MailMessage {
  const greeting = fullName ? `Chào ${fullName},` : 'Xin chào,';
  return {
    to,
    subject: 'Đặt lại mật khẩu WorkFlow',
    text:
      `${greeting}\n\n` +
      `Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này.\n\n` +
      `${link}\n\n` +
      `Liên kết có hiệu lực trong 60 phút và chỉ dùng được một lần.\n` +
      `Nếu bạn không yêu cầu, hãy bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.\n`,
    html: layout(
      'Đặt lại mật khẩu WorkFlow',
      `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
       <p style="margin:0">Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này.
       Liên kết có hiệu lực trong <strong>60 phút</strong> và chỉ dùng được một lần.</p>
       <p style="margin:12px 0 0">Nếu bạn không yêu cầu, hãy bỏ qua thư này — mật khẩu hiện tại vẫn giữ nguyên.</p>`,
      link,
      'Đặt lại mật khẩu'
    ),
  };
}

/** Thu nhac lai ma khoa man hinh (v58). Gui DUNG ma dang dung — khong doi, khong dat lai. */
export function lockPinEmail(to: string, fullName: string, pin: string, link: string): MailMessage {
  const greeting = fullName ? `Chào ${fullName},` : 'Xin chào,';
  return {
    to,
    subject: 'Mã mở khóa màn hình WorkFlow',
    text:
      `${greeting}\n\n` +
      `Mã mở khóa màn hình WorkFlow của bạn là: ${pin}\n\n` +
      `Mã không thay đổi. Bạn có thể đổi mã trong menu tài khoản → Khóa màn hình & màn chờ.\n` +
      `Nếu bạn không yêu cầu, hãy đổi mã ngay vì có thể ai đó đang dùng máy của bạn.\n\n` +
      `${link}\n`,
    html: layout(
      'Mã mở khóa màn hình',
      `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
       <p style="margin:0 0 12px">Mã mở khóa màn hình WorkFlow của bạn là:</p>
       <p style="margin:0 0 12px;font-size:28px;font-weight:700;letter-spacing:8px">${escapeHtml(pin)}</p>
       <p style="margin:0">Mã không thay đổi. Bạn có thể đổi mã trong <strong>menu tài khoản → Khóa màn hình &amp; màn chờ</strong>.
       Nếu bạn không yêu cầu, hãy đổi mã ngay vì có thể ai đó đang dùng máy của bạn.</p>`,
      link,
      'Mở WorkFlow'
    ),
  };
}
