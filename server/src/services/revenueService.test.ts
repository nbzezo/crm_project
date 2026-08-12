import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRevenueCell } from './revenueService.ts';

test('doanh thu forecast moi lay amount lam moc du kien', () => {
  assert.deepEqual(mergeRevenueCell(undefined, { amount_vnd: 100_000 }), {
    amount_vnd: 100_000,
    forecast_vnd: 100_000,
    stage: 'forecast',
    note: '',
  });
});

test('doi soat amount thuc te khong ghi de moc forecast ban dau', () => {
  const current = {
    amount_vnd: 100_000,
    forecast_vnd: 100_000,
    stage: 'forecast' as const,
    note: 'Du kien dau ky',
  };
  assert.deepEqual(mergeRevenueCell(current, { amount_vnd: 95_000, stage: 'reconciled' }), {
    amount_vnd: 95_000,
    forecast_vnd: 100_000,
    stage: 'reconciled',
    note: 'Du kien dau ky',
  });
});

test('sua amount sau doi soat tiep tuc bao toan forecast', () => {
  const current = {
    amount_vnd: 95_000,
    forecast_vnd: 100_000,
    stage: 'reconciled' as const,
    note: '',
  };
  assert.equal(mergeRevenueCell(current, { amount_vnd: 90_000 }).forecast_vnd, 100_000);
});

test('forecast gui ro rang, ke ca bang 0, luon duoc ton trong', () => {
  const current = {
    amount_vnd: 95_000,
    forecast_vnd: 100_000,
    stage: 'reconciled' as const,
    note: '',
  };
  assert.equal(mergeRevenueCell(current, { forecast_vnd: 0 }).forecast_vnd, 0);
});
