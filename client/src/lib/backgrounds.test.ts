import { describe, expect, it } from 'vitest';
import { ALL_BACKGROUNDS, boardScrim } from './backgrounds';

function luminance(hex: string, alpha: number) {
  const channels = [1, 3, 5].map(
    (start) => (parseInt(hex.slice(start, start + 2), 16) * (1 - alpha)) / 255
  );
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

describe('boardScrim', () => {
  it.each(ALL_BACKGROUNDS)('keeps white text AA-readable on %s', (background) => {
    const alpha = Number(boardScrim(background).match(/rgba\(0,0,0,([\d.]+)\)/)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0);
    for (const color of background.match(/#[0-9a-f]{6}/gi) ?? []) {
      expect(1.05 / (luminance(color, alpha) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
