import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const VIETNAMESE_DIACRITIC = /[à-ỹÀ-ỸđĐ]/;
const EXCEPTIONS = new Map([
  ['NEED_LOST_REASON', 'mã điều khiển để client mở hộp thoại lý do thua'],
  ['STAGE_GATE_BLOCKED', 'mã điều khiển để client hiển thị chi tiết cổng giai đoạn'],
]);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) return [];
    if (file.includes(path.join('db', 'migrate')) || file.endsWith(path.join('db', 'rollback.ts')))
      return [];
    return [file];
  });
}

function matchingParenthesis(source: string, open: number): number {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')' && --depth === 0) {
      return index;
    }
  }
  return -1;
}

function argumentsOf(source: string, start: number, end: number): string[] {
  const result: string[] = [];
  let begin = start;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') quote = character;
    else if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    else if (character === ',' && depth === 0) {
      result.push(source.slice(begin, index).trim());
      begin = index + 1;
    }
  }
  result.push(source.slice(begin, end).trim());
  return result;
}

function literalMessage(argument: string | undefined): string | undefined {
  if (!argument || !/^['`]/.test(argument)) return undefined;
  return argument.slice(1, -1);
}

test('mọi thông báo lỗi máy chủ dạng literal đều có dấu tiếng Việt', () => {
  const violations: string[] = [];
  const calls = [
    { name: 'new HttpError', expression: /new\s+HttpError\s*\(/g, argument: 1 },
    { name: 'required', expression: /\brequired\s*\(/g, argument: 1 },
    { name: 'assertInScope', expression: /\bassertInScope\s*\(/g, argument: -1 },
    { name: 'zod', expression: /\.(?:min|max|refine|regex)\s*\(/g, argument: -1 },
  ];

  const sourceRoot =
    path.basename(process.cwd()) === 'server'
      ? path.join(process.cwd(), 'src')
      : path.join(process.cwd(), 'server', 'src');
  for (const file of sourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const call of calls) {
      let match: RegExpExecArray | null;
      while ((match = call.expression.exec(source))) {
        const open = source.indexOf('(', match.index);
        const close = matchingParenthesis(source, open);
        if (close < 0) continue;
        const args = argumentsOf(source, open + 1, close);
        const argument = call.argument < 0 ? args.at(-1) : args[call.argument];
        const message = literalMessage(argument);
        if (!message || VIETNAMESE_DIACRITIC.test(message) || EXCEPTIONS.has(message)) continue;
        const line = source.slice(0, match.index).split('\n').length;
        violations.push(
          `${path.relative(process.cwd(), file)}:${line} (${call.name}) ${JSON.stringify(message)}`
        );
      }
    }

    const messageProperties = /\bmessage\s*:\s*(['"`])([\s\S]*?)\1/g;
    let property: RegExpExecArray | null;
    while ((property = messageProperties.exec(source))) {
      const message = property[2];
      if (VIETNAMESE_DIACRITIC.test(message) || EXCEPTIONS.has(message)) continue;
      const line = source.slice(0, property.index).split('\n').length;
      violations.push(
        `${path.relative(process.cwd(), file)}:${line} (message property) ${JSON.stringify(message)}`
      );
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
