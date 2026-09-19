import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/connection.ts';
import { parseBody } from '../lib/validate.ts';
import {
  getEmailConfig,
  sendMail,
  setEmailLastError,
  testEmailConnection,
  updateEmailConfig,
} from '../services/email/emailService.ts';

const router = Router();

/* Cung khuon voi routes/telegram.ts: GET/PUT /config, POST /test. Mat khau SMTP
   di vao mot chieu — doc ra chi con co `has_password`. */

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  host: z.string().trim().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().trim().max(200).optional(),
  password: z.string().max(400).optional(),
  clear_password: z.boolean().optional(),
  from_name: z.string().trim().max(120).optional(),
  from_email: z.string().trim().max(200).optional(),
  app_base_url: z.string().trim().max(300).optional(),
});

router.get('/config', (_req, res) => {
  res.json(getEmailConfig(db));
});

router.put('/config', (req, res) => {
  const body = parseBody(updateSchema, req);
  updateEmailConfig(db, {
    enabled: body.enabled,
    host: body.host,
    port: body.port,
    secure: body.secure,
    username: body.username,
    password: body.password,
    clearPassword: body.clear_password,
    fromName: body.from_name,
    fromEmail: body.from_email,
    appBaseUrl: body.app_base_url,
  });
  res.json(getEmailConfig(db));
});

router.post('/test', async (_req, res, next) => {
  try {
    await testEmailConnection(db);
    res.json(getEmailConfig(db));
  } catch (error) {
    next(error);
  }
});

const sendTestSchema = z.object({ to: z.string().email().max(200) });

/** Gui mot thu that toi dia chi do nguoi dung chon — `verify()` khong bat duoc loi tu choi nguoi nhan. */
router.post('/send-test', async (req, res, next) => {
  try {
    const { to } = parseBody(sendTestSchema, req);
    await sendMail(db, {
      to,
      subject: 'WorkFlow — thư kiểm tra cấu hình email',
      text:
        'Đây là thư kiểm tra do WorkFlow gửi.\n\n' +
        'Nhận được thư này nghĩa là cấu hình SMTP đã hoạt động: hệ thống gửi được ' +
        'thư mời tài khoản và liên kết đặt lại mật khẩu.\n',
    });
    setEmailLastError(db, null);
    res.json(getEmailConfig(db));
  } catch (error) {
    next(error);
  }
});

export default router;
