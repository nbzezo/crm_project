import { createApp } from './app.ts';
import { closeDatabase } from './db/connection.ts';

const PORT = Number(process.env.PORT ?? 3001);
const app = createApp();
const server = app.listen(PORT, () => {
  console.log(`[api] WorkFlow server dang chay tai http://localhost:${PORT}`);
});

function shutdown(signal: string) {
  console.log(`[api] Nhan ${signal}, dang dung ung dung...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
