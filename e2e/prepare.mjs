import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const expectedParent = path.resolve(os.tmpdir());
const target = path.join(expectedParent, 'workflow-clone-trello-e2e');

if (path.dirname(target) !== expectedParent) {
  throw new Error(`Tu choi don thu muc E2E ngoai pham vi: ${target}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
