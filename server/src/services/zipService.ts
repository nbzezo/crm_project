import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import { FILES_DIR } from '../db/connection.ts';

export interface ZipDocument {
  file_name: string;
  stored_name: string;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { date: number; time: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function safeUniqueName(original: string, used: Set<string>): string {
  const safe =
    [...path.basename(original).replace(/[<>:"/\\|?*]/g, '_')]
      .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
      .join('') || 'tai-lieu';
  const extension = path.extname(safe);
  const stem = path.basename(safe, extension);
  let candidate = safe;
  for (let index = 2; used.has(candidate.toLocaleLowerCase()); index += 1)
    candidate = `${stem} (${index})${extension}`;
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

/** Ghi ZIP theo che do store, tung tep mot, de khong giu toan bo goi ZIP trong bo nho. */
export function sendDocumentsZip(res: Response, documents: ZipDocument[]): void {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="tai-lieu.zip"');

  const central: Buffer[] = [];
  const used = new Set<string>();
  let offset = 0;

  for (const document of documents) {
    const filePath = path.join(FILES_DIR, document.stored_name);
    if (!fs.existsSync(filePath)) continue;
    const data = fs.readFileSync(filePath);
    const name = Buffer.from(safeUniqueName(document.file_name, used), 'utf8');
    const checksum = crc32(data);
    const stamp = dosDateTime();

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(stamp.time, 12);
    directory.writeUInt16LE(stamp.date, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, name]));

    res.write(local);
    res.write(name);
    res.write(data);
    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  for (const entry of central) {
    res.write(entry);
    offset += entry.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralOffset, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  res.end(end);
}
