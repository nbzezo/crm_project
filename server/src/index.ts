/* PHAI dung dau: ESM chay than module phu thuoc theo thu tu viet; moi lan khoi
   dong lai cung la luc migrations moi duoc nap vao CSDL. Vi
   db/connection.ts doc bien moi truong ngay khi duoc nap. */
import './loadEnv.ts';
import { createApp } from './app.ts';
import { closeDatabase } from './db/connection.ts';
import { db } from './db/connection.ts';
import { ensureAdminUser } from './services/auth/bootstrapAdmin.ts';
import { startAiAutomationScheduler } from './services/ai/automations.ts';
import { startDriveBackupScheduler } from './services/backup/driveBackup.ts';
import { startGoogleContactsScheduler } from './services/contacts/googleContacts.ts';
import { startBackupTelegramScheduler } from './services/telegram/telegramBackup.ts';
import { startTelegramNotifierScheduler } from './services/telegram/telegramNotifier.ts';
import { shutdownWorkerPool } from './lib/workerPool.ts';

const PORT = Number(process.env.PORT ?? 3001);

await ensureAdminUser();

const app = createApp();
const schedulers = [
  startAiAutomationScheduler(db),
  startTelegramNotifierScheduler(db),
  startBackupTelegramScheduler(db),
  startDriveBackupScheduler(db),
  startGoogleContactsScheduler(db),
];
const server = app.listen(PORT, () => {
  console.log(`[api] WorkFlow server dang chay tai http://localhost:${PORT}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] Nhan ${signal}, dang dung ung dung...`);
  const closeServer = new Promise<void>((resolve) => server.close(() => resolve()));
  const graceful = Promise.all([
    closeServer,
    ...schedulers.map((scheduler) => scheduler.stop()),
    shutdownWorkerPool(),
  ]).then(() => true);
  const drained = await Promise.race([
    graceful,
    new Promise<false>((resolve) => setTimeout(() => resolve(false), 15_000)),
  ]);
  if (drained) {
    closeDatabase();
  } else {
    /* Khong dong DB trong khi job con co the dung no; process exit se thu hoi tai nguyen. */
    console.error('[api] Qua 15 giay, buoc dung ma khong dong DB giua job dang chay.');
  }
  process.exit(drained ? 0 : 1);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
