import type { RevenueStage } from '@workflow/contracts';

export interface RevenueCell {
  amount_vnd: number;
  forecast_vnd: number;
  stage: RevenueStage;
  note: string;
}

export interface RevenuePatch {
  amount_vnd?: number;
  forecast_vnd?: number;
  stage?: RevenueStage;
  note?: string;
}

/** Bao toan moc forecast khi doanh thu chuyen sang cac giai doan thuc te. */
export function mergeRevenueCell(
  current: RevenueCell | undefined,
  patch: RevenuePatch
): RevenueCell {
  const amount = patch.amount_vnd ?? current?.amount_vnd ?? 0;
  const stage = patch.stage ?? current?.stage ?? 'forecast';
  const forecast =
    patch.forecast_vnd ??
    (stage === 'forecast' ? amount : current?.forecast_vnd || current?.amount_vnd || amount);
  return {
    amount_vnd: amount,
    forecast_vnd: forecast,
    stage,
    note: patch.note ?? current?.note ?? '',
  };
}
