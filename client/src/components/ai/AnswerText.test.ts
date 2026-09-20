import { describe, expect, it } from 'vitest';
import { toBlocks } from './AnswerText';

/**
 * Cau tra loi cua tro ly la Markdown do mot mo hinh sinh ra — ta khong kiem
 * soat duoc no viet gi, chi kiem soat duoc cach doc. Bo test nay khoa lai phan
 * doc do, vi mot loi o day khong lam gi do NGUNG CHAY: no chi lam cau tra loi
 * hien ra sai, va sai mot cach de tuong la mo hinh tra loi kem.
 */
describe('toBlocks', () => {
  it('doc gach dau dong, danh sach danh so va tieu de', () => {
    const blocks = toBlocks(
      [
        '## Viec can lam',
        '',
        '- Goi khach A',
        '- Goi khach B',
        '',
        '1. Buoc mot',
        '2. Buoc hai',
      ].join('\n')
    );
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'bullets', 'numbers']);
    expect(blocks[1].lines).toEqual(['Goi khach A', 'Goi khach B']);
    expect(blocks[2].lines).toEqual(['Buoc mot', 'Buoc hai']);
  });

  it('noi lai dong bi ngat giua mot gach dau dong', () => {
    /* Mo hinh xuong dong vi dong qua dai chu khong phai vi het y. Tach ra
       thanh doan rieng se cat doi mot cau ngay giua chung — day la loi da
       nhin thay tren man hinh truoc khi co test nay. */
    const blocks = toBlocks(
      ['- Goi chi Lan trong tuan nay — hop dong gan han', '  nhat.'].join('\n')
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('bullets');
    expect(blocks[0].lines).toEqual(['Goi chi Lan trong tuan nay — hop dong gan han nhat.']);
  });

  it('mot DONG TRONG van ket thuc danh sach', () => {
    const blocks = toBlocks(['- Mot muc', '', 'Mot doan van moi.'].join('\n'));
    expect(blocks.map((b) => b.kind)).toEqual(['bullets', 'para']);
    expect(blocks[1].lines).toEqual(['Mot doan van moi.']);
  });

  it('giu nguyen tung dong trong khoi ma', () => {
    const blocks = toBlocks(['```sql', 'SELECT 1', '  FROM t', '```'].join('\n'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('code');
    expect(blocks[0].lines).toEqual(['SELECT 1', '  FROM t']);
  });

  it('khoi ma chua dong khong lam mat phan da doc', () => {
    /* Cau tra loi bi cat giua chung (het token) van phai hien ra duoc. */
    const blocks = toBlocks(['Ket qua:', '```', 'SELECT 1'].join('\n'));
    expect(blocks.map((b) => b.kind)).toEqual(['para', 'code']);
  });

  it('khong coi mot dau gach giua cau la gach dau dong', () => {
    const blocks = toBlocks('Doanh thu 10-12 trieu mot thang.');
    expect(blocks.map((b) => b.kind)).toEqual(['para']);
  });
});
