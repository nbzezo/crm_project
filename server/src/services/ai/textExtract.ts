import fs from 'node:fs';
import path from 'node:path';
import { runInWorker } from '../../lib/workerPool.ts';
import { extractFile as extractFileDirect, type ExtractResult } from './textExtractCore.ts';

export type { ExtractResult, ExtractMethod } from './textExtractCore.ts';

const MAX_EXTRACT_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 400_000;

export async function extractText(
  filePath: string,
  mime: string | null,
  fileName: string,
  maxBytes: number = MAX_EXTRACT_BYTES
): Promise<ExtractResult> {
  let size: number;
  try {
    ({ size } = await fs.promises.stat(filePath));
  } catch {
    return { text: '', method: 'none', reason: 'Không tìm thấy tệp' };
  }
  if (size > maxBytes)
    return { text: '', method: 'none', reason: `Tệp lớn hơn ${maxBytes / 1024 / 1024} MB` };
  let ext = path.extname(fileName).toLowerCase();
  if (mime?.startsWith('text/')) ext = '.txt';
  else if (!ext && mime === 'application/pdf') ext = '.pdf';
  try {
    return await runInWorker<ExtractResult>({
      kind: 'extract-text',
      filePath,
      ext,
      maxChars: MAX_TEXT_CHARS,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Xử lý tệp quá lâu') throw error;
    try {
      return await extractFileDirect(filePath, ext, MAX_TEXT_CHARS);
    } catch (directError) {
      return {
        text: '',
        method: 'none',
        reason: directError instanceof Error ? directError.message : 'Không đọc được nội dung tệp',
      };
    }
  }
}
