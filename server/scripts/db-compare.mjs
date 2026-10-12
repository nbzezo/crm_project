/*
 * Doi chieu hai tep DUMP cua db-profile.mjs (truoc/sau khi viet lai truy van):
 *   node scripts/db-compare.mjs truoc.json sau.json
 * Bao "KHAC" khi so lieu doi; "chi khac thu tu" khi cung tap phan tu nhung xep khac
 * (cac dong bang nhau theo ORDER BY khong co thu tu xac dinh). Thoat ma 1 neu co KHAC.
 */
import fs from 'node:fs';

const [a, b] = process.argv.slice(2).map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const VOLATILE = new Set(['server_time', 'generated_at', 'now']);
const canon = (value, sortArrays) => {
  if (Array.isArray(value)) {
    const items = value.map((item) => canon(item, sortArrays));
    return sortArrays
      ? items
          .map((x) => JSON.stringify(x))
          .sort()
          .map((x) => JSON.parse(x))
      : items;
  }
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !VOLATILE.has(key))
        .sort()
        .map((key) => [key, canon(value[key], sortArrays)])
    );
  return value;
};
let failed = false;
for (const endpoint of new Set([...Object.keys(a), ...Object.keys(b)])) {
  const x = a[endpoint];
  const y = b[endpoint];
  if (JSON.stringify(canon(x, false)) === JSON.stringify(canon(y, false))) {
    console.log(`GIONG        ${endpoint}`);
  } else if (JSON.stringify(canon(x, true)) === JSON.stringify(canon(y, true))) {
    console.log(`chi khac thu tu ${endpoint}`);
  } else {
    failed = true;
    const sx = JSON.stringify(canon(x, true));
    const sy = JSON.stringify(canon(y, true));
    let i = 0;
    while (i < sx.length && sx[i] === sy[i]) i++;
    console.log(
      `KHAC         ${endpoint}\n  truoc: ...${sx.slice(Math.max(0, i - 120), i + 120)}\n  sau:   ...${sy.slice(Math.max(0, i - 120), i + 120)}`
    );
  }
}
process.exit(failed ? 1 : 0);
