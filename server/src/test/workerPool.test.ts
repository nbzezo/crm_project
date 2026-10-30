import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { buildTemplate, parseWorkbook } from '../services/revenueImport.ts';
import { runInWorker, shutdownWorkerPool } from '../lib/workerPool.ts';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'workflow-worker-'));

function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const n = Buffer.from(name),
      data = Buffer.from(content),
      local = Buffer.alloc(30),
      entry = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(n.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    central.push(Buffer.concat([entry, n]));
    offset += 30 + n.length + data.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const docx = zip([
  [
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  ],
  [
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  ],
  [
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Worker DOCX</w:t></w:r></w:p></w:body></w:document>',
  ],
]);
await fs.writeFile(path.join(dir, 'note.txt'), 'Worker text');
await fs.writeFile(path.join(dir, 'note.docx'), docx);

after(async () => {
  await shutdownWorkerPool();
  await fs.rm(dir, { recursive: true, force: true });
});

test('worker đọc text và DOCX giống đường chạy trực tiếp', async () => {
  const text = await runInWorker<{ text: string; method: string }>({
    kind: 'extract-text',
    filePath: path.join(dir, 'note.txt'),
    ext: '.txt',
  });
  const doc = await runInWorker<{ text: string; method: string }>({
    kind: 'extract-text',
    filePath: path.join(dir, 'note.docx'),
    ext: '.docx',
  });
  assert.deepEqual(text, { text: 'Worker text', method: 'text' });
  assert.equal(doc.method, 'docx');
  assert.match(doc.text, /Worker DOCX/);
});

test('lỗi một job không làm hỏng job kế tiếp', async () => {
  await assert.rejects(
    runInWorker({ kind: 'extract-text', filePath: path.join(dir, 'missing.txt'), ext: '.txt' }),
    /Không tìm thấy tệp/
  );
  await assert.rejects(
    runInWorker({ kind: 'parse-revenue-workbook', buffer: Buffer.from('bad') }),
    /workbook|zip|file|central/i
  );
  const result = await runInWorker<{ text: string }>({
    kind: 'extract-text',
    filePath: path.join(dir, 'note.txt'),
    ext: '.txt',
  });
  assert.equal(result.text, 'Worker text');
});

test('năm job chạy đúng hàng đợi FIFO', async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      runInWorker<{ text: string }>({
        kind: 'extract-text',
        filePath: path.join(dir, 'note.txt'),
        ext: '.txt',
        maxChars: i + 1,
      })
    )
  );
  assert.deepEqual(
    results.map((result) => result.text.length),
    [1, 2, 3, 4, 5]
  );
});

test('job lớn không chặn event loop luồng chính', async () => {
  const large = path.join(dir, 'large.txt');
  await fs.writeFile(large, Buffer.alloc(20 * 1024 * 1024, 65));
  let ticked = false;
  const timer = new Promise<void>((resolve) =>
    setTimeout(() => {
      ticked = true;
      resolve();
    }, 0)
  );
  const job = runInWorker({ kind: 'extract-text', filePath: large, ext: '.txt' });
  await timer;
  assert.equal(ticked, true);
  await job;
});

test('tối đa hai job chạy và tám job chờ; job thứ 11 bị từ chối 503', async () => {
  const large = path.join(dir, 'large.txt');
  const results = await Promise.allSettled(
    Array.from({ length: 11 }, () =>
      runInWorker({ kind: 'extract-text', filePath: large, ext: '.txt', maxChars: 1 })
    )
  );
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0] as PromiseRejectedResult).reason.status, 503);
  assert.equal((rejected[0] as PromiseRejectedResult).reason.details.code, 'WORKER_POOL_BUSY');
});

test('parse workbook qua worker bằng kết quả trực tiếp', async () => {
  const buffer = await buildTemplate(
    2026,
    [],
    ['Alpha'],
    ['SMS'],
    [{ am: 'Minh', months: [10] }],
    []
  );
  const expected = await parseWorkbook(buffer);
  const actual = await runInWorker({ kind: 'parse-revenue-workbook', buffer });
  assert.deepEqual(actual, expected);
});

test('report worker doc WAL bang ket noi readonly va tra ca batch', async () => {
  const dbPath = path.join(dir, 'report.db');
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.exec(`CREATE TABLE metrics (value INTEGER); INSERT INTO metrics VALUES (2), (3)`);
  database.close();

  const result = await runInWorker<unknown[]>({
    kind: 'report-queries',
    dbPath,
    queries: [
      { mode: 'get', sql: 'SELECT SUM(value) AS total FROM metrics' },
      { mode: 'all', sql: 'SELECT value FROM metrics ORDER BY value DESC' },
    ],
  });
  assert.deepEqual(result, [{ total: 5 }, [{ value: 3 }, { value: 2 }]]);

  await assert.rejects(
    runInWorker({
      kind: 'report-queries',
      dbPath,
      queries: [{ mode: 'get', sql: 'INSERT INTO metrics VALUES (4) RETURNING value' }],
    }),
    /readonly|read-only|write/i
  );
});
