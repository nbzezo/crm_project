import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Nap `.env` o goc repo khi chay local.
 *
 * `.env.example` van bao nguoi dung "sao chep thanh .env roi dien gia tri that",
 * nhung truoc day chi docker-compose doc file do (`env_file:`). Chay `npm run dev`
 * thi khong ai nap ca, nen may chu tu choi khoi dong vi thieu
 * WORKFLOW_SESSION_SECRET du file .env nam ngay canh — mot cai bay cho bat ky ai
 * moi clone repo ve.
 *
 * Dung `process.loadEnvFile` co san tu Node 20.12 thay vi them dotenv: mot
 * dependency nua cho mot viec ma runtime da lam duoc.
 *
 * BIEN MOI TRUONG THAT LUON THANG tep `.env`. `loadEnvFile` ghi de, nen phai
 * chup lai truoc va tra lai sau — tren may chu that, bien do CI/Docker cap khong
 * duoc phep bi mot tep `.env` con sot lai tren dia de len.
 *
 * Phai la import DAU TIEN cua index.ts. ESM chay than cac module phu thuoc theo
 * dung thu tu viet, ma `db/connection.ts` doc env ngay khi duoc nap — dat sau no
 * thi khong con tac dung gi.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, '..', '..', '.env');

if (fs.existsSync(envPath)) {
  const fromProcess = { ...process.env };
  try {
    process.loadEnvFile(envPath);
    for (const [key, value] of Object.entries(fromProcess)) {
      if (value !== undefined) process.env[key] = value;
    }
    console.log('[env] Da nap cau hinh tu .env');
  } catch (error) {
    console.warn('[env] Khong doc duoc .env:', error instanceof Error ? error.message : error);
  }
}
