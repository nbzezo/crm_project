// The client tsconfig intentionally omits Node types; Vitest runs this file in Node.
// @ts-expect-error Node types are not part of the browser application bundle.
import fs from 'node:fs';
// @ts-expect-error Node types are not part of the browser application bundle.
import path from 'node:path';
import { describe, expect, it } from 'vitest';

declare const process: { cwd(): string };

const root = path.resolve(process.cwd(), 'src');
const forbidden =
  /forecast|scoring|champion|economic buyer|next action|single-threaded|veto|thắng/i;
const technical = new Set([
  'forecast',
  'scoring',
  'veto',
  'forecast_eligible',
  'scoring-settings',
  'scoringTitle',
  'next_action',
  'single_threaded',
]);

function filesUnder(folder: string, extension: string): string[] {
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .flatMap((entry: { isDirectory(): boolean; name: string }) => {
      const file = path.join(folder, entry.name);
      return entry.isDirectory()
        ? filesUnder(file, extension)
        : file.endsWith(extension)
          ? [file]
          : [];
    });
}

function visibleStrings(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  const quoted = code
    .split('\n')
    .flatMap((line) =>
      [...line.matchAll(/(['"])(.*?)\1/g), ...line.matchAll(/`([^`\n$]*)`/g)].map(
        (match) => match[2] ?? match[1]
      )
    );
  const jsxText = [...source.matchAll(/>([A-Za-zÀ-ỹ][^<\n]*)</g)].map((match) => match[1]);
  return [...quoted, ...jsxText]
    .map((value) => value.replace(/\\(['"`])/g, '$1').trim())
    .filter(
      (value) =>
        value &&
        !technical.has(value) &&
        !value.includes('{') &&
        (/\s/.test(value) ||
          value.split('').some((char) => char.charCodeAt(0) > 127) ||
          (value !== value.toLowerCase() && !value.includes('/')))
    );
}

describe('thuật ngữ giao diện', () => {
  it('không để sót thuật ngữ tiếng Anh hoặc cách nói cũ trong chuỗi hiển thị', () => {
    const files = [
      ...filesUnder(path.join(root, 'i18n'), '.ts').filter(
        (file) => !file.endsWith('terminology.test.ts')
      ),
      ...filesUnder(path.join(root, 'components', 'crm'), '.tsx'),
      ...filesUnder(path.join(root, 'pages'), '.tsx'),
    ];
    const offenders = files.flatMap((file) =>
      visibleStrings(fs.readFileSync(file, 'utf8'))
        .filter((value) => forbidden.test(value))
        .map((value) => `${path.relative(root, file)}: ${value}`)
    );

    expect(offenders).toEqual([]);
  });
});
