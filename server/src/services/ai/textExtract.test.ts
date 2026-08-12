import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractText } from './textExtract.ts';

/*
 * Fixture duoc sinh ngay trong test thay vi commit tep nhi phan: mot tep .docx nam
 * trong repo khong ai doc duoc de biet no chua gi, con o day cau truc hien ro nen
 * khi bo doc hong ta biet chinh xac no da bo sot phan nao.
 */

let dir = '';

const CRC = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Goi ZIP che do store — du de docx/xlsx doc duoc, khong can thu vien nen. */
function zip(entries: [string, string][]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt32LE(offset, 42);

    locals.push(local, nameBuffer, data);
    central.push(Buffer.concat([entry, nameBuffer]));
    offset += 30 + nameBuffer.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** PDF toi thieu, khong nen, mot trang, van ban qua toan tu Tj. */
function minimalPdf(lines: string[]): Buffer {
  const stream = `BT /F1 14 Tf 60 780 Td ${lines
    .map((line, index) => (index === 0 ? `(${line}) Tj` : `0 -22 Td (${line}) Tj`))
    .join(' ')} ET`;
  const objects = [
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n',
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n',
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>endobj\n',
    `4 0 obj<</Length ${stream.length}>>stream\n${stream}\nendstream endobj\n`,
    '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }
  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-extract-'));

  fs.writeFileSync(path.join(dir, 'ghi-chu.txt'), 'Ghi chú họp ngày 2026-08-12 với khách hàng.');

  fs.writeFileSync(
    path.join(dir, 'hop-dong.docx'),
    zip([
      [
        '[Content_Types].xml',
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ],
      [
        '_rels/.rels',
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ],
      [
        'word/document.xml',
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
          '<w:p><w:r><w:t>HỢP ĐỒNG DỊCH VỤ số 42/2026</w:t></w:r></w:p>' +
          '<w:p><w:r><w:t>Hiệu lực từ 2026-01-01</w:t></w:r></w:p></w:body></w:document>',
      ],
    ])
  );

  fs.writeFileSync(
    path.join(dir, 'bao-gia.xlsx'),
    zip([
      ['[Content_Types].xml', '<?xml version="1.0"?><Types/>'],
      [
        'xl/sharedStrings.xml',
        '<?xml version="1.0"?><sst><si><t>Khách hàng</t></si><si><t>Công ty Thăng Long</t></si>' +
          '<si><t>Tổng cộng</t></si></sst>',
      ],
      [
        'xl/worksheets/sheet1.xml',
        '<?xml version="1.0"?><worksheet><sheetData>' +
          '<row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>' +
          '<row r="2"><c t="s"><v>2</v></c><c><v>250000000</v></c></row>' +
          '</sheetData></worksheet>',
      ],
    ])
  );

  fs.writeFileSync(
    path.join(dir, 'bao-gia.pdf'),
    minimalPdf(['BAO GIA DICH VU 2026', 'Khach hang: Cong ty Thang Long'])
  );

  fs.writeFileSync(path.join(dir, 'anh.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
});

after(() => {
  if (dir.startsWith(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true });
});

test('doc duoc tep text thuan va giu nguyen dau tieng Viet', async () => {
  const result = await extractText(path.join(dir, 'ghi-chu.txt'), 'text/plain', 'ghi-chu.txt');
  assert.equal(result.method, 'text');
  assert.match(result.text, /Ghi chú họp ngày 2026-08-12/);
});

test('doc duoc noi dung .docx — truoc v14 chi lap chi muc bang metadata', async () => {
  const result = await extractText(path.join(dir, 'hop-dong.docx'), null, 'hop-dong.docx');
  assert.equal(result.method, 'docx');
  assert.match(result.text, /HỢP ĐỒNG DỊCH VỤ số 42\/2026/);
  assert.match(result.text, /Hiệu lực từ 2026-01-01/);
});

test('doc duoc .xlsx: ghep bang chuoi dung chung voi o tinh', async () => {
  const result = await extractText(path.join(dir, 'bao-gia.xlsx'), null, 'bao-gia.xlsx');
  assert.equal(result.method, 'xlsx');
  // Chuoi nam o sharedStrings, so nam thang trong o — thieu mot ben la sai.
  assert.match(result.text, /Công ty Thăng Long/);
  assert.match(result.text, /250000000/);
});

test('doc duoc van ban trong PDF', async () => {
  const result = await extractText(path.join(dir, 'bao-gia.pdf'), 'application/pdf', 'bao-gia.pdf');
  assert.equal(result.method, 'pdf');
  assert.match(result.text, /BAO GIA DICH VU 2026/);
  assert.match(result.text, /Cong ty Thang Long/);
});

test('dinh dang chua ho tro va tep hong deu khong nem loi', async () => {
  const image = await extractText(path.join(dir, 'anh.png'), 'image/png', 'anh.png');
  assert.equal(image.method, 'none');
  assert.ok(image.reason);

  // Tep .docx hong: phai bao khong doc duoc chu khong duoc lam vo luong upload.
  const brokenPath = path.join(dir, 'hong.docx');
  fs.writeFileSync(brokenPath, Buffer.from('day khong phai goi ZIP'));
  const broken = await extractText(brokenPath, null, 'hong.docx');
  assert.equal(broken.method, 'none');
  assert.ok(broken.reason);

  const missing = await extractText(path.join(dir, 'khong-ton-tai.pdf'), null, 'khong-ton-tai.pdf');
  assert.equal(missing.method, 'none');
});
