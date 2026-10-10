import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { db } from './db/connection.ts';
import { HttpError } from './lib/validate.ts';
import { requireAuth } from './middleware/requireAuth.ts';
import { attachCurrentUser, requirePermission, requireResource } from './middleware/currentUser.ts';
import { SqliteSessionStore } from './services/auth/SqliteSessionStore.ts';
import { trackWrites } from './lib/responseCache.ts';
import auth from './routes/auth.ts';
import users from './routes/users.ts';
import orgUnits from './routes/orgUnits.ts';
import positions from './routes/positions.ts';
import driveBackup from './routes/driveBackup.ts';
import email from './routes/email.ts';
import myContacts from './routes/myContacts.ts';
import lockScreen from './routes/lockScreen.ts';
import musicLinks from './routes/musicLinks.ts';
import boards from './routes/boards.ts';
import lists from './routes/lists.ts';
import cards from './routes/cards.ts';
import checklist from './routes/checklist.ts';
import cardFields from './routes/cardFields.ts';
import comments from './routes/comments.ts';
import labels from './routes/labels.ts';
import customers from './routes/customers.ts';
import contacts from './routes/contacts.ts';
import deals from './routes/deals.ts';
import contracts from './routes/contracts.ts';
import quotations from './routes/quotations.ts';
import documents from './routes/documents.ts';
import services from './routes/services.ts';
import revenues from './routes/revenues.ts';
import interactions from './routes/interactions.ts';
import meetingNotes from './routes/meetingNotes.ts';
import quickNotes from './routes/quickNotes.ts';
import reminders from './routes/reminders.ts';
import nudges from './routes/nudges.ts';
import projects from './routes/projects.ts';
import calendarEvents from './routes/calendarEvents.ts';
import views from './routes/views.ts';
import scoring from './routes/scoring.ts';
import settings from './routes/settings.ts';
import taskFlows from './routes/taskFlows.ts';
import taskStatuses from './routes/taskStatuses.ts';
import crmConfig from './routes/crmConfig.ts';
import system from './routes/system.ts';
import ai from './routes/ai.ts';
import focus from './routes/focus.ts';
import notifications from './routes/notifications.ts';
import telegram from './routes/telegram.ts';
import shares from './routes/shares.ts';
import publicShare from './routes/publicShare.ts';
import feed from './routes/feed.ts';
import myTelegram from './routes/myTelegram.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

/** Request lau hon muc nay bi ghi `[slow]` ra log. */
const SLOW_REQUEST_MS = 1000;

interface AppOptions {
  /** Bat lop dang nhap (session + requireAuth). Tat trong unit test khong can auth. */
  auth?: boolean;
}

export function createApp(options: AppOptions = {}): Express {
  const { auth: useAuth = true } = options;
  const app = express();
  app.set('trust proxy', 1);
  // CSP tat de khong vo client (Vite/Tailwind/BlockNote/Excalidraw); cac header
  // khac cua helmet (HSTS, X-Content-Type-Options, X-Frame-Options...) van bat.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '5mb' }));

  /* Ghi lai request cham. Node mot luong + SQLite dong bo: mot request 3 s la 3 s
     MOI nguoi dung khac cung cho, nen can thay ngay trong `docker logs`. Chi ghi
     duong dan, khong ghi query string (co the chua tu khoa tim kiem, ten khach). */
  app.use((req, res, next) => {
    const started = performance.now();
    res.on('finish', () => {
      const ms = performance.now() - started;
      if (ms >= SLOW_REQUEST_MS) {
        console.warn(
          `[slow] ${req.method} ${req.baseUrl}${req.path} ${res.statusCode} ${Math.round(ms)}ms`
        );
      }
    });
    next();
  });

  if (useAuth) {
    const secret = process.env.WORKFLOW_SESSION_SECRET;
    if (!secret) {
      throw new Error(
        '[auth] Thieu WORKFLOW_SESSION_SECRET — dat mot chuoi ngau nhien dai (>= 32 ky tu) roi khoi dong lai.'
      );
    }
    app.use(
      session({
        name: 'sid',
        store: new SqliteSessionStore(),
        secret,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: {
          httpOnly: true,
          // 'auto': Secure khi chay sau proxy TLS (trust proxy + X-Forwarded-Proto),
          // khong bat buoc khi truy cap thang qua http (dev / E2E).
          secure: 'auto',
          sameSite: 'lax',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        },
      })
    );
  }

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, app: 'WorkFlow', database: 'ready' });
  });

  /* Lien ket chia se cong khai: KHONG dang nhap, nen phai nam TRUOC requireAuth.
     Router tu gioi han toc do va chi tra ra cac truong da duoc loc. */
  app.use('/api/public/share', publicShare);

  if (useAuth) {
    app.use('/api/auth', auth);
    app.use('/api', requireAuth);
  }

  /* Gan `req.currentUser` cho MOI route nghiep vu — ke ca khi tat xac thuc,
     luc do no lui ve contacts.is_me de cac integration test giu nguyen hanh vi.
     Phai nam sau requireAuth va truoc tat ca router ben duoi. */
  app.use('/api', attachCurrentUser);
  /* Ghi nhan ai vua ghi du lieu, de lop dem cac man tong hop bo ban cu cua ho. */
  app.use('/api', trackWrites);

  /* Quan tri — tu bao ve bang requirePermission ben trong tung router, vi chung
     tron nhieu resource (vd /api/org-units doc ca danh ba). */
  app.use('/api/users', users);
  app.use('/api/org-units', orgUnits);
  app.use('/api/positions', positions);
  app.use('/api/email', requireResource('settings.email'), email);

  /* Chan TINH NANG theo resource: GET can `read`, POST can `create`, ... Dat o
     day chu khong rai vao tung route de mot route them sau nay khong the lot
     luoi — day la cho duy nhat phai nho, va no nam ngay canh danh sach mount.

     Day CHUA phai chan du lieu: ai thay ban ghi cua ai la viec cua dot ke tiep
     (`visibleContactIds`). Mot endpoint mo khong co nghia la moi dong hien ra. */
  app.use('/api/boards', requireResource('boards'), boards);
  app.use('/api/lists', requireResource('boards'), lists);
  app.use('/api/cards', requireResource('tasks'), cards);
  app.use('/api/checklist', requireResource('tasks'), checklist);
  app.use('/api/task-flows', requireResource('tasks'), taskFlows);
  app.use('/api/task-statuses', requireResource('tasks'), taskStatuses);
  app.use('/api/card-fields', requireResource('boards'), cardFields);
  app.use('/api/comments', requireResource('tasks'), comments);
  app.use('/api/labels', labels);
  app.use('/api/customers', requireResource('customers'), customers);
  app.use('/api/contacts', requireResource('contacts'), contacts);
  app.use('/api/deals', requireResource('deals'), deals);
  app.use('/api/contracts', requireResource('contracts'), contracts);
  app.use('/api/quotations', requireResource('quotations'), quotations);
  app.use('/api/documents', requireResource('documents'), documents);
  app.use('/api/services', requireResource('services'), services);
  app.use('/api/revenues', requireResource('revenues'), revenues);
  app.use('/api/interactions', requireResource('interactions'), interactions);
  app.use('/api/meeting-notes', requireResource('notes'), meetingNotes);
  app.use('/api/quick-notes', requireResource('notes'), quickNotes);
  app.use('/api/reminders', requireResource('tasks'), reminders);
  app.use('/api/notifications', notifications);
  app.use('/api/telegram', requireResource('settings.telegram'), telegram);
  /* Tu kiem quyen ben trong (theo loai ban ghi duoc chia se), khong dung requireResource. */
  app.use('/api/shares', shares);
  /* Truoc `app.use('/api', requireResource('deals'), scoring)` ben duoi: router do bat moi
     duong /api chua khop va doi quyen `deals`, nen mount sau no se bi chan nham. */
  app.use('/api/drive-backup', driveBackup);
  /* Danh ba ca nhan: ai dang nhap cung co; rao rieng tu nam trong tung truy van. */
  app.use('/api/my-contacts', myContacts);
  app.use('/api/lock-screen', lockScreen);
  /* Link nhac yeu thich: rieng tung tai khoan, ai dang nhap cung co. */
  app.use('/api/music-links', musicLinks);
  /* Bang tin nhom (v68): ai dang nhap cung co — ranh gioi la thanh vien nhom, kiem
     trong services/feedService.ts; tep va ban ghi CRM gan vao bai van theo quyen rieng. */
  app.use('/api/feed', feed);
  /* Telegram rieng cua tung tai khoan (v70): ai dang nhap cung tu cau hinh cho minh. */
  app.use('/api/me/telegram', myTelegram);
  app.use('/api/nudges', requireResource('tasks'), nudges);
  app.use('/api/projects', requireResource('projects'), projects);
  app.use('/api/calendar', requireResource('tasks'), calendarEvents);
  app.use('/api/views', views);
  app.use('/api/focus', requirePermission('tasks', 'read'), focus);
  /* Ai dang nhap cung doc duoc (moi o chon can danh muc); ghi tu kiem `settings.app`. */
  app.use('/api/crm-config', crmConfig);
  app.use('/api/settings', requireResource('settings.app'), settings);
  app.use('/api', requireResource('deals'), scoring);
  app.use('/api', system);
  app.use('/api/ai', requireResource('ai'), ai);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Khong tim thay endpoint' });
  });

  // Production (Docker): server phuc vu luon ban build cua client tren cung origin,
  // nen khong can CORS. Bo qua khi chua co ban build (dev dung Vite, test khong co).
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Khong tim thay endpoint' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.details });
      return;
    }
    console.error('[api]', err);
    const message = err instanceof Error ? err.message : 'Loi khong xac dinh';
    res.status(500).json({ error: message });
  });

  return app;
}
