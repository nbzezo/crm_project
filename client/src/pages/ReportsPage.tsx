import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, qs } from '../api/client';
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/common/ui';
import { ChartDataTable } from '../components/common/ChartDataTable';
import {
  CATEGORICAL_COLORS,
  CHART_PRIMARY,
  PRIORITY_COLORS,
  PRIORITY_ORDER,
  STAGE_ORDER,
  t,
} from '../i18n/vi';
import {
  formatDateShort,
  formatMonth,
  formatPercent,
  formatVND,
  formatVNDShort,
  todayStr,
} from '../lib/format';
import { FACTOR_LABELS, QUADRANT_COLORS, QUADRANT_LABELS } from '../i18n/scoring';
import { AssigneeChip } from '../components/tasks/AssigneePicker';
import type { Factor, InteractionType, OrgKind, Priority, Quadrant, Stage } from '../types';
import { PageHeader } from '../components/common/PageShell';
import { ReportRangePicker } from '../components/common/ReportRangePicker';
import { resolveRange, type RangeKey } from '../lib/reportRange';

interface ReportsData {
  from: string;
  to: string;
  /** Tien do cac du an dang chay — chi viec tren bang thuoc du an. */
  by_project: {
    id: number;
    name: string;
    status: string;
    plan_end: string | null;
    completed: number;
    done_total: number;
    task_total: number;
    open_count: number;
    overdue_count: number;
    late_milestones: number;
    next_milestone: string | null;
  }[];
  projects_by_status: { status: string; count: number }[];
  /** Thông lượng và khối lượng theo người phụ trách (v18). */
  by_assignee: {
    contact_id: number | null;
    assignee_name: string | null;
    org_name: string | null;
    org_kind: OrgKind | null;
    completed: number;
    open_count: number;
    overdue_count: number;
    due_week_count: number;
    week_hours: number;
    /** Bao nhiêu việc đang mở đã có ước lượng — để biết `week_hours` đủ hay thiếu. */
    estimated_count: number;
  }[];
  /** Phân bố số lần dời hạn; đuôi càng dài thì kế hoạch càng không đáng tin. */
  slip_distribution: { slips: number; task_count: number }[];
  completed_by_week: { week_start: string; count: number }[];
  open_by_priority: { priority: Priority; count: number }[];
  pipeline_by_stage: { stage: Stage; count: number; sum_vnd: number }[];
  won_by_month: { month: string; count: number; sum_vnd: number }[];
  interactions_by_type: { type: InteractionType; count: number }[];
  win_rate: { won: number; lost: number; rate: number };
  top_customers: { id: number; name: string; won_vnd: number; won_count: number }[];
  summary: { overdue_count: number; due_week_count: number; open_pipeline_vnd: number };
  /** F-10 + F-16 — đối chiếu điểm lúc chốt với kết quả thắng/thua. */
  score_winloss: {
    by_quadrant: Record<Quadrant, { won: number; lost: number }>;
    lost_reason_by_factor: Record<string, Record<string, number>>;
    scored_closed_count: number;
    min_deals: number;
  };
}

/* Mau truc/nhan lay tu token trong index.css (khoi `.recharts-*`), khong dat o day. */
const AXIS_PROPS = {
  tick: { fontSize: 11 },
  tickLine: false,
};

/**
 * Trang Báo cáo trong nhom Du an: CHI so lieu cua du an va cong viec. So lieu ban
 * hang nam o Suc khoe pipeline (nhom Kinh doanh); ban day du o tab Báo cáo tổng
 * cua trang Tong quan.
 */
export default function ReportsPage() {
  return (
    <div className="space-y-4 p-6">
      <PageHeader description="Tiến độ dự án và công việc theo khoảng thời gian đã chọn." />
      <ReportsContent variant="projects" />
    </div>
  );
}

/**
 * Noi dung bao cao, khong co tieu de trang. `all` cho tab "Báo cáo tổng" o Tong
 * quan (du an + cong viec + kinh doanh); `projects` cho trang Báo cáo cua nhom Du an.
 */
export function ReportsContent({ variant = 'all' }: { variant?: 'all' | 'projects' }) {
  const sales = variant === 'all';
  const [rangeKey, setRangeKey] = useState<RangeKey>('six');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(todayStr());

  const range = resolveRange(rangeKey, customFrom, customTo);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['reports', range.from, range.to],
    queryFn: () => api.get<ReportsData>(`/api/views/reports${qs(range)}`),
  });

  if (error)
    return (
      <div>
        <ErrorState onRetry={() => refetch()} />
      </div>
    );

  if (isLoading || !data)
    return (
      <div role="status" aria-label={t.common.loading} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-panel" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-panel" />
          ))}
        </div>
      </div>
    );

  const priorityData = PRIORITY_ORDER.map((priority) => ({
    priority,
    name: t.priority[priority],
    count: data.open_by_priority.find((row) => row.priority === priority)?.count ?? 0,
  })).filter((row) => row.count > 0);

  const stageData = STAGE_ORDER.filter((s) => s !== 'lost').map((stage) => {
    const row = data.pipeline_by_stage.find((r) => r.stage === stage);
    return { name: t.stage[stage], sum_vnd: row?.sum_vnd ?? 0, count: row?.count ?? 0 };
  });

  const interactionData = data.interactions_by_type.map((row) => ({
    name: t.interactionType[row.type],
    count: row.count,
  }));

  const weekData = data.completed_by_week.map((row) => ({
    name: formatDateShort(row.week_start),
    count: row.count,
  }));

  const assigneeRows = data.by_assignee ?? [];
  const slipRows = (data.slip_distribution ?? [])
    // 0 lần dời là trạng thái bình thường — bày nó lên biểu đồ chỉ làm át phần đuôi.
    .filter((row) => row.slips > 0)
    .map((row) => ({ name: `${row.slips} lần`, count: row.task_count }));

  const monthData = data.won_by_month.map((row) => ({
    name: formatMonth(row.month),
    sum_vnd: row.sum_vnd,
    count: row.count,
  }));

  const winTotal = data.win_rate.won + data.win_rate.lost;

  /* Khoang thoi gian khong co gi: truoc day moi the tu ve mot dong "Chưa có dữ
     liệu trong khoảng này" — tam lan tren cung mot trang, khien trang trong nhin
     nhu bi loi. Mot thong bao o CAP TRANG dung mot lan, kem loi khuyen doi
     khoang, la du. */
  const projectRows = data.by_project ?? [];
  const projectCount = (status: string) =>
    (data.projects_by_status ?? []).find((row) => row.status === status)?.count ?? 0;
  const lateMilestones = projectRows.reduce((sum, row) => sum + row.late_milestones, 0);

  const hasTaskData =
    projectRows.length > 0 ||
    assigneeRows.length > 0 ||
    slipRows.length > 0 ||
    weekData.length > 0 ||
    priorityData.length > 0;
  const hasSalesData =
    monthData.length > 0 ||
    interactionData.length > 0 ||
    data.top_customers.length > 0 ||
    stageData.some((row) => row.sum_vnd !== 0 || row.count !== 0);
  const hasAnyData = hasTaskData || (sales && hasSalesData);

  return (
    <div className="space-y-4">
      <ReportRangePicker
        rangeKey={rangeKey}
        onRangeKeyChange={setRangeKey}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={t.common.overdue} value={String(data.summary.overdue_count)} />
        <Tile label={t.reports.dueThisWeek} value={String(data.summary.due_week_count)} />
        {sales ? (
          <>
            <Tile
              label={t.reports.openPipeline}
              value={formatVNDShort(data.summary.open_pipeline_vnd)}
            />
            <Tile
              label={t.reports.winRate}
              value={winTotal === 0 ? '—' : formatPercent(data.win_rate.rate)}
              hint={
                winTotal === 0
                  ? undefined
                  : `${data.win_rate.won} thắng / ${data.win_rate.lost} thua`
              }
            />
          </>
        ) : (
          <>
            <Tile
              label="Dự án đang triển khai"
              value={String(projectCount('active'))}
              hint={`${projectCount('planning')} lập kế hoạch · ${projectCount('on_hold')} tạm dừng`}
            />
            <Tile
              label="Mốc trễ hạn"
              value={String(lateMilestones)}
              hint="Mốc chưa đạt đã qua hạn, trên các dự án đang chạy"
            />
          </>
        )}
      </div>

      {!hasAnyData && (
        <EmptyState
          message="Chưa có dữ liệu trong khoảng này."
          hint={
            sales
              ? 'Chọn một khoảng thời gian rộng hơn, hoặc ghi nhận thêm cơ hội và công việc rồi quay lại.'
              : 'Chọn một khoảng thời gian rộng hơn, hoặc gắn bảng công việc vào dự án rồi quay lại.'
          }
        />
      )}

      <div className={`grid grid-cols-1 gap-4 lg:grid-cols-2 ${hasAnyData ? '' : 'hidden'}`}>
        {/* Ai đang gánh gì — đặt đầu tiên vì đây là câu hỏi hay được hỏi nhất khi
            mở trang Báo cáo với mục đích quản lý tiến độ, chứ không phải bán hàng. */}
        <ProjectProgress rows={projectRows} />

        <Panel title="Công việc theo người phụ trách" className="lg:col-span-2">
          {assigneeRows.length === 0 ? (
            <NoData />
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {assigneeRows.map((row) => (
                  <article
                    key={row.contact_id ?? 'unassigned'}
                    className="rounded-panel border border-tr-border bg-tr-panel p-3"
                  >
                    <div className="mb-1 text-sm font-semibold text-tr-text">
                      {row.assignee_name ? (
                        <AssigneeChip name={row.assignee_name} orgKind={row.org_kind} />
                      ) : (
                        t.card.unassigned
                      )}
                    </div>
                    <p className="mb-3 text-xs text-tr-muted">
                      {row.org_name ?? 'Chưa có tổ chức'}
                    </p>
                    <div className="grid grid-cols-4 gap-1 text-center text-xs">
                      <div>
                        <strong className="block text-lg text-tr-text">{row.completed}</strong>Hoàn
                        thành
                      </div>
                      <div>
                        <strong className="block text-lg text-tr-text">{row.open_count}</strong>Đang
                        mở
                      </div>
                      <div>
                        <strong className="block text-lg text-tr-danger">
                          {row.overdue_count}
                        </strong>
                        Quá hạn
                      </div>
                      <div>
                        <strong className="block text-lg text-tr-text">{row.due_week_count}</strong>
                        Tuần này
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <div
                className="tr-scroll hidden overflow-x-auto md:block"
                /* Vung cuon ngang phai cuon duoc bang ban phim (WCAG 2.1.1) —
                 bang rong thi ben trong khong con gi focus duoc. */
                tabIndex={0}
              >
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">
                    Thông lượng và khối lượng theo người phụ trách
                  </caption>
                  <thead className="text-left text-xs text-tr-subtle">
                    <tr>
                      <th scope="col" className="px-2 py-1.5">
                        Người phụ trách
                      </th>
                      <th scope="col" className="px-2 py-1.5">
                        Tổ chức
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right">
                        Hoàn thành kỳ này
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right">
                        Đang mở
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right">
                        Quá hạn
                      </th>
                      <th scope="col" className="px-2 py-1.5 text-right">
                        Tuần này
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tr-border">
                    {assigneeRows.map((row) => (
                      <tr key={row.contact_id ?? 'unassigned'}>
                        <td className="px-2 py-1.5">
                          {row.assignee_name ? (
                            <AssigneeChip name={row.assignee_name} orgKind={row.org_kind} />
                          ) : (
                            <span className="text-tr-danger italic">{t.card.unassigned}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-tr-muted">{row.org_name ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-tr-text">
                          {row.completed}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-tr-subtle">
                          {row.open_count}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right tabular-nums ${row.overdue_count > 0 ? 'font-semibold text-tr-danger' : 'text-tr-muted'}`}
                        >
                          {row.overdue_count}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-tr-subtle">
                          {row.due_week_count}
                          {/* Chỉ hiện số giờ khi MỌI việc tuần này đều đã ước lượng —
                            một tổng cộng dồn từ dữ liệu thiếu là một tổng sai. */}
                          {row.week_hours > 0 && (
                            <span className="ml-1 text-xs text-tr-muted">
                              (
                              {row.estimated_count < row.due_week_count
                                ? `≥ ${row.week_hours}h`
                                : `${row.week_hours}h`}
                              )
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Số lần dời hạn">
          {slipRows.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={slipRows} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value} công việc`, 'Số lượng']}
                />
                <Bar dataKey="count" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-xs text-tr-muted">
            Đuôi bên phải càng dài thì kế hoạch càng ít đáng tin — mỗi cột là số công việc đã dời
            hạn bấy nhiêu lần.
          </p>
          <ChartDataTable
            caption="Số lần dời hạn"
            rows={slipRows.map((row) => ({ name: row.name, value: `${row.count} công việc` }))}
          />
        </Panel>

        <Panel title={t.reports.completedByWeek}>
          {weekData.length === 0 ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="name" {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [`${value} công việc`, 'Hoàn thành']}
                />
                <Bar dataKey="count" fill={CHART_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <ChartDataTable
            caption={t.reports.completedByWeek}
            rows={weekData.map((row) => ({ name: row.name, value: `${row.count} công việc` }))}
          />
        </Panel>

        {sales && (
          <Panel title={t.reports.wonByMonth}>
            {monthData.length === 0 ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthData} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" {...AXIS_PROPS} />
                  <YAxis
                    tickFormatter={(v) => formatVNDShort(v as number)}
                    width={62}
                    {...AXIS_PROPS}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value) => [formatVND(value as number), 'Doanh thu']}
                  />
                  <Line
                    type="monotone"
                    dataKey="sum_vnd"
                    stroke={CHART_PRIMARY}
                    strokeWidth={2}
                    /* Vien quanh diem lay mau be mat tu token (index.css, `.recharts-dot`)
                     de diem trong nhu duoc khoet ra khoi panel o ca sau theme —
                     truoc day la '#fff' cung, sai han tren nen toi. */
                    dot={{ r: 4, fill: CHART_PRIMARY, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
            <ChartDataTable
              caption={t.reports.wonByMonth}
              rows={monthData.map((row) => ({ name: row.name, value: formatVND(row.sum_vnd) }))}
            />
          </Panel>
        )}

        {sales && (
          <Panel title={t.reports.pipelineByStage}>
            {/* Guard rong: nam panel con lai deu co NoData, rieng panel nay truoc day
              van ve truc trong khi chua co co hoi nao. */}
            {stageData.every((row) => row.sum_vnd === 0 && row.count === 0) ? (
              <NoData />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={stageData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 12 }}
                >
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatVNDShort(v as number)}
                    {...AXIS_PROPS}
                  />
                  <YAxis type="category" dataKey="name" width={104} {...AXIS_PROPS} />
                  <Tooltip
                    cursor={{ fill: 'rgba(11,11,11,0.04)' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value, _name, item) => [
                      `${formatVND(value as number)} · ${(item?.payload as { count: number }).count} cơ hội`,
                      'Giá trị',
                    ]}
                  />
                  <Bar
                    dataKey="sum_vnd"
                    fill={CHART_PRIMARY}
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
            <ChartDataTable
              caption={t.reports.pipelineByStage}
              rows={stageData.map((row) => ({
                name: row.name,
                value: `${formatVND(row.sum_vnd)} · ${row.count} cơ hội`,
              }))}
            />
          </Panel>
        )}

        <Panel title={t.reports.openByPriority}>
          {priorityData.length === 0 ? (
            <NoData />
          ) : (
            <DonutWithLegend
              data={priorityData.map((row) => ({ name: row.name, count: row.count }))}
              colors={priorityData.map((row) => PRIORITY_COLORS[row.priority])}
              unit="công việc"
            />
          )}
          <ChartDataTable
            caption={t.reports.openByPriority}
            rows={priorityData.map((row) => ({ name: row.name, value: `${row.count} công việc` }))}
          />
        </Panel>

        {sales && (
          <>
            <Panel title={t.reports.interactionsByType}>
              {interactionData.length === 0 ? (
                <NoData />
              ) : (
                <DonutWithLegend
                  data={interactionData}
                  colors={interactionData.map(
                    (_, i) => CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]
                  )}
                  unit="lần"
                />
              )}
              <ChartDataTable
                caption={t.reports.interactionsByType}
                rows={interactionData.map((row) => ({ name: row.name, value: `${row.count} lần` }))}
              />
            </Panel>

            <Panel title={t.reports.topCustomers}>
              {data.top_customers.length === 0 ? (
                <NoData />
              ) : (
                <ul className="divide-y divide-tr-border">
                  {data.top_customers.map((customer) => (
                    <li key={customer.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-tr-text">{customer.name}</span>
                      <span className="text-xs text-tr-muted">{customer.won_count} cơ hội</span>
                      <span className="font-medium text-tr-success tabular-nums">
                        {formatVND(customer.won_vnd)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>

      {sales && <ScoreWinLoss data={data.score_winloss} />}
    </div>
  );
}

/**
 * F-10 + F-16 — kiểm chứng rubric bằng dữ liệu thật của chính tổ chức.
 *
 * Bảng chéo *lý do thua × yếu tố thấp nhất lúc chốt*: ô lệch (thua vì giá mà PRICE lúc
 * đó chấm cao) là bằng chứng **rubric đang bị chấm sai**, không phải rubric sai.
 *
 * Dưới ngưỡng số deal đã chốt thì chỉ hiện số đếm, không đưa khuyến nghị hiệu chỉnh
 * ngưỡng — dưới cỡ mẫu đó mọi kết luận đều là khớp nhiễu.
 */
function ScoreWinLoss({ data }: { data: ReportsData['score_winloss'] }) {
  const quadrants = Object.keys(data.by_quadrant) as Quadrant[];
  const enough = data.scored_closed_count >= data.min_deals;
  const reasons = Object.keys(data.lost_reason_by_factor);

  return (
    <Panel
      title="Thắng/thua theo điểm lúc chốt"
      action={
        <span className="text-xs text-tr-muted">
          {data.scored_closed_count} cơ hội đã chốt có điểm
        </span>
      }
      className="mt-4"
    >
      {data.scored_closed_count === 0 ? (
        <p className="py-6 text-center text-sm text-tr-muted">
          Chưa có cơ hội nào được chấm điểm rồi chốt. Bảng này sẽ có dữ liệu sau khi các cơ hội đang
          chấm được đóng lại.
        </p>
      ) : (
        <>
          {!enough && (
            <p className="mb-3 rounded-control border border-tr-warning/50 bg-tr-warning/10 px-2.5 py-2 text-xs text-tr-text">
              Mới có {data.scored_closed_count}/{data.min_deals} cơ hội đã chốt có điểm. Số liệu
              dưới đây chỉ để tham khảo — chưa đủ cỡ mẫu để hiệu chỉnh ngưỡng.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quadrants.map((quadrant) => {
              const row = data.by_quadrant[quadrant];
              const total = row.won + row.lost;
              return (
                <div key={quadrant} className="rounded-control border border-tr-border p-2.5">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: QUADRANT_COLORS[quadrant] }}
                  >
                    {QUADRANT_LABELS[quadrant]}
                  </span>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-tr-text">
                    {total === 0 ? '—' : formatPercent(row.won / total)}
                  </p>
                  <p className="text-xs text-tr-muted">
                    {row.won} thắng / {row.lost} thua
                  </p>
                </div>
              );
            })}
          </div>

          {reasons.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <h3 className="mb-2 text-xs font-semibold text-tr-subtle">
                Lý do thua × yếu tố thấp nhất lúc chốt
              </h3>
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-tr-border text-left text-xs text-tr-muted">
                    <th scope="col" className="py-1.5 pr-3 font-medium">
                      Lý do thua
                    </th>
                    <th scope="col" className="py-1.5 font-medium">
                      Yếu tố yếu nhất khi chốt
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reasons.map((reason) => (
                    <tr key={reason} className="border-b border-tr-border/60">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal text-tr-text">
                        {t.lostReason[reason] ?? reason}
                      </th>
                      <td className="py-1.5">
                        <span className="flex flex-wrap gap-1.5">
                          {Object.entries(data.lost_reason_by_factor[reason]).map(
                            ([factor, count]) => (
                              <span
                                key={factor}
                                className="rounded bg-tr-hover px-1.5 py-0.5 text-xs text-tr-subtle"
                              >
                                {FACTOR_LABELS[factor as Factor] ?? factor} × {count}
                              </span>
                            )
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-tr-muted">
                Ô lệch — ví dụ thua vì giá mà yếu tố yếu nhất lại không phải Giá cả — là bằng chứng
                rubric đang bị chấm sai, không phải rubric sai.
              </p>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * Ban so lieu chi danh cho trinh doc man hinh.
 * Bieu do SVG cua recharts khong co noi dung thay the, nen nguoi dung
 * trinh doc man hinh truoc day mat toan bo phan bao cao.
 */

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid var(--tr-border)',
  backgroundColor: 'var(--tr-panel)',
  color: 'var(--tr-text)',
  fontSize: 12,
  boxShadow: 'var(--tr-popover-shadow)',
};

function DonutWithLegend({
  data,
  colors,
  unit,
}: {
  data: { name: string; count: number }[];
  colors: string[];
  unit: string;
}) {
  const total = data.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="flex items-center gap-4">
      {/* `inert` (kem `aria-hidden`): recharts dat `role="img"` len tung lat banh
          ma khong kem ten nen axe bao svg-img-alt. Rieng `aria-hidden` thi chua
          du — ben trong van con phan tu focus duoc, thanh ra loi aria-hidden-focus
          (phan tu Tab toi duoc nhung trinh doc man hinh khong thay). `inert` go
          han ca kha nang focus lan su hien dien tren cay a11y, dung y do: danh
          sach <ul> ngay ben phai da liet ke du ten + so luong + phan tram cua
          tung lat, nen vung ve chi con la trang tri. */}
      <div className="w-[55%]" inert aria-hidden="true">
        <ResponsiveContainer width="100%" height={190}>
          <PieChart>
            {/* Duong tach giua cac lat lay mau be mat tu token (index.css,
              `.recharts-sector`) — truoc day la stroke trang cung, sai tren nen toi. */}
            <Pie
              data={data}
              dataKey="count"
              nameKey="name"
              innerRadius={45}
              outerRadius={72}
              paddingAngle={2}
              strokeWidth={2}
            >
              {data.map((_, index) => (
                <Cell key={index} fill={colors[index]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, name) => [`${value} ${unit}`, name as string]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5">
        {data.map((row, index) => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="flex-1 truncate text-tr-subtle">{row.name}</span>
            <span className="font-medium text-tr-text tabular-nums">{row.count}</span>
            <span className="w-10 text-right text-xs text-tr-muted tabular-nums">
              {total ? Math.round((row.count / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tien do tung du an dang chay: hoan thanh / tong viec, viec qua han, moc. */
function ProjectProgress({ rows }: { rows: ReportsData['by_project'] }) {
  return (
    <Panel title="Tiến độ theo dự án" className="lg:col-span-2">
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-tr-muted">
          Chưa có dự án đang chạy nào có bảng công việc.
        </p>
      ) : (
        <div
          className="tr-scroll overflow-x-auto"
          /* Vung cuon ngang phai cuon duoc bang ban phim (WCAG 2.1.1). */
          tabIndex={0}
        >
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Tiến độ theo dự án</caption>
            <thead className="text-left text-xs text-tr-subtle">
              <tr>
                <th scope="col" className="px-2 py-1.5">
                  Dự án
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Tiến độ
                </th>
                <th scope="col" className="px-2 py-1.5 text-right">
                  Xong trong kỳ
                </th>
                <th scope="col" className="px-2 py-1.5 text-right">
                  Đang mở
                </th>
                <th scope="col" className="px-2 py-1.5 text-right">
                  Quá hạn
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Mốc
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Kết thúc dự kiến
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tr-border">
              {rows.map((row) => {
                const ratio = row.task_total > 0 ? row.done_total / row.task_total : 0;
                return (
                  <tr key={row.id}>
                    <th scope="row" className="px-2 py-1.5 text-left font-normal">
                      <Link
                        to={`/projects/${row.id}`}
                        className="text-tr-text hover:text-tr-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                      <div className="text-xs text-tr-muted">
                        {t.projectStatus[row.status] ?? row.status}
                      </div>
                    </th>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-1.5 w-24 overflow-hidden rounded-full bg-tr-hover"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-full bg-tr-primary"
                            style={{ width: `${Math.round(ratio * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-tr-subtle tabular-nums">
                          {formatPercent(ratio)} · {row.done_total}/{row.task_total}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.completed}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.open_count}</td>
                    <td
                      className={`px-2 py-1.5 text-right tabular-nums ${row.overdue_count > 0 ? 'font-semibold text-tr-danger' : ''}`}
                    >
                      {row.overdue_count}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {row.late_milestones > 0 && (
                        <span className="text-tr-danger">{row.late_milestones} mốc trễ</span>
                      )}
                      {row.late_milestones > 0 && row.next_milestone && ' · '}
                      {row.next_milestone ? (
                        <span className="text-tr-subtle">
                          tiếp theo {formatDateShort(row.next_milestone)}
                        </span>
                      ) : (
                        row.late_milestones === 0 && <span className="text-tr-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-tr-subtle">
                      {row.plan_end ? formatDateShort(row.plan_end) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-tr-border bg-tr-panel p-4 shadow-sm">
      <div className="truncate text-xs text-tr-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-tr-text">{value}</div>
      {hint && <div className="text-xs text-tr-muted">{hint}</div>}
    </div>
  );
}

function NoData() {
  return (
    <p className="py-12 text-center text-sm text-tr-muted">Chưa có dữ liệu trong khoảng này.</p>
  );
}
