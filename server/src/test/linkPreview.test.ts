import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  extractPreview,
  getLinkPreview,
  isBlockedAddress,
  parsePreviewUrl,
} from '../services/linkPreview.ts';

/*
 * Xem truoc link o Bang tin: doc the Open Graph, va KHONG goi duoc dia chi noi bo (SSRF).
 */

test('chan dia chi noi bo, cho dia chi cong khai', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('tu choi URL sai giao thuc, cong la, dang nhap, localhost', () => {
  for (const raw of [
    'ftp://example.com',
    'file:///etc/passwd',
    'http://example.com:8080/',
    'http://user:pass@example.com/',
    'http://localhost/',
    'http://127.0.0.1/',
    'http://[::1]/',
    'khong-phai-url',
  ]) {
    assert.throws(() => parsePreviewUrl(raw), raw);
  }
  assert.equal(parsePreviewUrl('https://example.com/a#b').toString(), 'https://example.com/a');
});

test('may chu noi bo khong bi goi toi', async () => {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits++;
    res.setHeader('Content-Type', 'text/html');
    res.end('<title>Bi mat</title>');
  });
  await new Promise<void>((resolve) => server.listen(80, '127.0.0.1', resolve)).catch(() => null);
  await assert.rejects(() => getLinkPreview('http://127.0.0.1/'));
  /* Ten mien tro ve 127.0.0.1 cung bi chan o buoc tra DNS. */
  assert.equal(await getLinkPreview('http://localtest.me/'), null);
  assert.equal(hits, 0);
  server.close();
});

test('doc Open Graph, roi ve <title> va the description', () => {
  const page = new URL('https://vnexpress.net/bai-viet');
  const og = extractPreview(
    `<html><head>
      <meta property="og:title" content="Gi&aacute; v&agrave;ng &amp; USD">
      <meta content='Mô tả ngắn' property='og:description' />
      <meta property="og:image" content="/anh/1.jpg">
      <meta property="og:site_name" content="VnExpress">
      <title>Khong dung</title></head></html>`,
    page
  );
  assert.equal(og.title, 'Giá vàng & USD');
  assert.equal(og.description, 'Mô tả ngắn');
  assert.equal(og.image, 'https://vnexpress.net/anh/1.jpg');
  assert.equal(og.site, 'VnExpress');

  const plain = extractPreview(
    `<title>  Trang
      chu  </title><meta name="description" content="Gioi thieu &#273;&#x1EA7;y &#273;&#x1EE7;">`,
    new URL('https://www.example.com/')
  );
  assert.equal(plain.title, 'Trang chu');
  assert.equal(plain.description, 'Gioi thieu đầy đủ');
  assert.equal(plain.image, null);
  assert.equal(plain.site, 'example.com');

  const bad = extractPreview(
    `<meta property="og:image" content="javascript:alert(1)">`,
    new URL('https://example.com/')
  );
  assert.equal(bad.image, null);
});
