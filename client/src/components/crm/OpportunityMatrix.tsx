/**
 * F-02 — Ma trận cơ hội: toàn bộ pipeline trên hai trục.
 *
 * Trục X là 4P (ta có thắng được không), trục Y là BANT (đây có phải cơ hội thật không).
 * Kích thước điểm theo giá trị deal, viền đỏ khi có veto chặn forecast — bất kể nằm ở ô nào.
 */
import { useNavigate } from 'react-router';
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { QUADRANT_COLORS, QUADRANT_LABELS } from '../../i18n/scoring';
import { t } from '../../i18n/vi';
import { formatVND } from '../../lib/format';
import type { Quadrant, Stage } from '../../types';

export interface MatrixDeal {
  id: number;
  title: string;
  stage: Stage;
  value_vnd: number;
  customer_name: string;
  bant_total: number;
  p4_total: number;
  quadrant: Quadrant;
  v1_no_event: number;
  v2_no_economic: number;
}

const CUTOFF = 7;

export function OpportunityMatrix({ deals }: { deals: MatrixDeal[] }) {
  const navigate = useNavigate();

  /* Tách nhẹ các điểm trùng tọa độ để deal cùng điểm không đè lên nhau. */
  const seen = new Map<string, number>();
  const points = deals.map((deal) => {
    const key = `${deal.p4_total}-${deal.bant_total}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4;
    return {
      ...deal,
      x: deal.p4_total + (n === 0 ? 0 : 0.18 * Math.cos(angle)),
      y: deal.bant_total + (n === 0 ? 0 : 0.18 * Math.sin(angle)),
      z: Math.max(deal.value_vnd, 1),
    };
  });

  return (
    <div className="h-[26rem] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
          {/* Bốn ô nền theo đúng quy ước màu của toàn hệ thống */}
          <ReferenceArea
            x1={-0.5}
            x2={CUTOFF}
            y1={CUTOFF}
            y2={12.5}
            fill={QUADRANT_COLORS.reshape}
            fillOpacity={0.1}
          />
          <ReferenceArea
            x1={CUTOFF}
            x2={12.5}
            y1={CUTOFF}
            y2={12.5}
            fill={QUADRANT_COLORS.pursue}
            fillOpacity={0.1}
          />
          <ReferenceArea
            x1={-0.5}
            x2={CUTOFF}
            y1={-0.5}
            y2={CUTOFF}
            fill={QUADRANT_COLORS.disqualify}
            fillOpacity={0.1}
          />
          <ReferenceArea
            x1={CUTOFF}
            x2={12.5}
            y1={-0.5}
            y2={CUTOFF}
            fill={QUADRANT_COLORS.nurture}
            fillOpacity={0.1}
          />

          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-tr-border)" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[-0.5, 12.5]}
            ticks={[0, 3, 6, 9, 12]}
            tick={{ fontSize: 11, fill: 'var(--color-tr-muted)' }}
            label={{
              value: '4P — ta có khả năng thắng không',
              position: 'bottom',
              offset: 8,
              style: { fontSize: 11, fill: 'var(--color-tr-muted)' },
            }}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, 12.5]}
            ticks={[0, 3, 6, 9, 12]}
            tick={{ fontSize: 11, fill: 'var(--color-tr-muted)' }}
            label={{
              value: 'BANT — đây có phải cơ hội thật không',
              angle: -90,
              position: 'insideLeft',
              style: { fontSize: 11, fill: 'var(--color-tr-muted)' },
            }}
          />
          <ZAxis type="number" dataKey="z" range={[60, 900]} />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ payload }) => {
              const deal = payload?.[0]?.payload as MatrixDeal | undefined;
              if (!deal) return null;
              const vetoed = Boolean(deal.v1_no_event || deal.v2_no_economic);
              return (
                <div className="rounded-panel border border-tr-border bg-tr-panel p-2.5 text-xs shadow-lg">
                  <p className="font-semibold text-tr-text">{deal.title}</p>
                  <p className="text-tr-muted">{deal.customer_name}</p>
                  <p className="mt-1 text-tr-text">
                    BANT {deal.bant_total}/12 · 4P {deal.p4_total}/12 ·{' '}
                    <span style={{ color: QUADRANT_COLORS[deal.quadrant] }}>
                      {QUADRANT_LABELS[deal.quadrant]}
                    </span>
                  </p>
                  <p className="text-tr-muted">
                    {t.stage[deal.stage]} · {formatVND(deal.value_vnd)}
                  </p>
                  {vetoed && <p className="mt-1 text-tr-danger">Đang bị chặn khỏi forecast</p>}
                </div>
              );
            }}
          />
          <Scatter
            data={points}
            onClick={(point: { id?: number }) => point?.id && navigate(`/deals/${point.id}`)}
            cursor="pointer"
          >
            {points.map((point) => (
              <Cell
                key={point.id}
                fill={QUADRANT_COLORS[point.quadrant]}
                fillOpacity={0.75}
                stroke={point.v1_no_event || point.v2_no_economic ? '#e04b3a' : 'transparent'}
                strokeWidth={2}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
