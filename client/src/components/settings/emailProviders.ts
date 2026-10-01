/*
 * Mau cau hinh SMTP cho cac hop thu pho bien.
 *
 * Khong luu "nha cung cap" xuong CSDL: no suy ra duoc tu `host`, va mot cot rieng
 * se lech ngay khi ai do sua tay host. Chon mau chi la dien san bon o — sau do
 * van la cau hinh SMTP binh thuong, sua tiep duoc.
 *
 * Ca ba deu dung STARTTLS o cong 587 va doi ten dang nhap = dia chi gui di: Gmail
 * va Microsoft tu choi (hoac viet lai) thu co From khac tai khoan dang nhap.
 */

export type EmailProviderId = 'custom' | 'gmail' | 'microsoft365' | 'outlook';

export interface EmailProvider {
  id: Exclude<EmailProviderId, 'custom'>;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  /** Cac buoc lay mat khau dung cho SMTP — mat khau dang nhap thuong khong dung duoc. */
  steps: string[];
  helpUrl: string;
  helpLabel: string;
}

export const EMAIL_PROVIDERS: EmailProvider[] = [
  {
    id: 'gmail',
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    steps: [
      'Bật Xác minh 2 bước cho tài khoản Google gửi thư.',
      'Tạo Mật khẩu ứng dụng (App Password) 16 ký tự cho "Mail".',
      'Dán mật khẩu ứng dụng vào ô Mật khẩu bên dưới — không dùng mật khẩu Gmail thường.',
    ],
    helpUrl: 'https://myaccount.google.com/apppasswords',
    helpLabel: 'Mở trang Mật khẩu ứng dụng của Google',
  },
  {
    id: 'microsoft365',
    label: 'Microsoft 365',
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    steps: [
      'Quản trị viên Microsoft 365 bật "Authenticated SMTP" cho hộp thư gửi thư (Admin center → Users → Mail → Manage email apps).',
      'Nếu tài khoản có MFA: tạo App Password, hoặc dùng một hộp thư dịch vụ không bật MFA.',
      'Nếu tenant đã tắt SMTP AUTH cho toàn tổ chức thì cách này không dùng được — chuyển sang Tuỳ chỉnh và dùng một dịch vụ SMTP khác (SendGrid, Amazon SES…).',
    ],
    helpUrl:
      'https://learn.microsoft.com/exchange/clients-and-mobile-in-exchange-online/authenticated-client-smtp-submission',
    helpLabel: 'Hướng dẫn bật SMTP AUTH của Microsoft',
  },
  {
    id: 'outlook',
    label: 'Outlook.com / Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    steps: [
      'Bật Xác minh 2 bước cho tài khoản Microsoft cá nhân.',
      'Tạo App Password ở mục Bảo mật nâng cao và dán vào ô Mật khẩu bên dưới.',
    ],
    helpUrl: 'https://account.live.com/proofs/AppPassword',
    helpLabel: 'Mở trang tạo App Password của Microsoft',
  },
];

export function detectProvider(host: string): EmailProviderId {
  const normalized = host.trim().toLowerCase();
  return EMAIL_PROVIDERS.find((provider) => provider.host === normalized)?.id ?? 'custom';
}
