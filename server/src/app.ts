import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { db } from './db/connection.ts';
import { HttpError } from './lib/validate.ts';
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

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ ok: true, app: 'WorkFlow', database: 'ready' });
  });

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
