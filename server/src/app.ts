import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { db } from './db/connection.ts';
import { HttpError } from './lib/validate.ts';
import { requireAuth } from './middleware/requireAuth.ts';
import { SqliteSessionStore } from './services/auth/SqliteSessionStore.ts';
import auth from './routes/auth.ts';
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
import system from './routes/system.ts';
import ai from './routes/ai.ts';
import notifications from './routes/notifications.ts';
import telegram from './routes/telegram.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(here, '../../client/dist');

export interface AppOptions {
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

  if (useAuth) {
    app.use('/api/auth', auth);
    app.use('/api', requireAuth);
  }

  app.use('/api/boards', boards);
  app.use('/api/lists', lists);
  app.use('/api/cards', cards);
  app.use('/api/checklist', checklist);
  app.use('/api/card-fields', cardFields);
  app.use('/api/comments', comments);
  app.use('/api/labels', labels);
  app.use('/api/customers', customers);
  app.use('/api/contacts', contacts);
  app.use('/api/deals', deals);
  app.use('/api/contracts', contracts);
  app.use('/api/quotations', quotations);
  app.use('/api/documents', documents);
  app.use('/api/services', services);
  app.use('/api/revenues', revenues);
  app.use('/api/interactions', interactions);
  app.use('/api/meeting-notes', meetingNotes);
  app.use('/api/quick-notes', quickNotes);
  app.use('/api/reminders', reminders);
  app.use('/api/notifications', notifications);
  app.use('/api/telegram', telegram);
  app.use('/api/nudges', nudges);
  app.use('/api/projects', projects);
  app.use('/api/calendar', calendarEvents);
  app.use('/api/views', views);
  app.use('/api/settings', settings);
  app.use('/api', scoring);
  app.use('/api', system);
  app.use('/api/ai', ai);

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
