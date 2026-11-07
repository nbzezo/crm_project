/*
 * Mau so do logic, viet duoi dang "khung" (skeleton) cua Excalidraw —
 * convertToExcalidrawElements tu dung hinh, gan chu vao hinh va noi mui ten
 * vao dung hai dau. Khong can them thu vien Mermaid chi de co vai mau.
 */

interface TemplateNode {
  id: string;
  text: string;
  x: number;
  y: number;
  shape?: 'rectangle' | 'ellipse' | 'diamond';
  w?: number;
  h?: number;
}
type TemplateEdge = [from: string, to: string, label?: string];
interface TemplateLane {
  text: string;
  y: number;
  h: number;
}

export interface FlowchartTemplate {
  key: string;
  label: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  lanes?: TemplateLane[];
}

const W = 170;
const H = 64;

export const FLOWCHART_TEMPLATES: FlowchartTemplate[] = [
  {
    key: 'approval',
    label: 'Quy trình duyệt',
    nodes: [
      { id: 'start', text: 'Bắt đầu', x: 0, y: 0, shape: 'ellipse' },
      { id: 'draft', text: 'Soạn đề xuất', x: 0, y: 130 },
      {
        id: 'check',
        text: 'Trưởng phòng duyệt?',
        x: -15,
        y: 260,
        shape: 'diamond',
        w: 200,
        h: 110,
      },
      { id: 'do', text: 'Thực hiện', x: 0, y: 440 },
      { id: 'fix', text: 'Chỉnh sửa theo góp ý', x: 300, y: 283 },
      { id: 'end', text: 'Kết thúc', x: 0, y: 570, shape: 'ellipse' },
    ],
    edges: [
      ['start', 'draft'],
      ['draft', 'check'],
      ['check', 'do', 'Đồng ý'],
      ['check', 'fix', 'Chưa đạt'],
      ['fix', 'draft'],
      ['do', 'end'],
    ],
  },
  {
    key: 'swimlane',
    label: 'Chia làn theo bộ phận',
    lanes: [
      { text: 'Khách hàng', y: 0, h: 140 },
      { text: 'Kinh doanh', y: 140, h: 140 },
      { text: 'Kỹ thuật', y: 280, h: 140 },
    ],
    nodes: [
      { id: 'need', text: 'Gửi yêu cầu', x: 160, y: 38 },
      { id: 'quote', text: 'Lập báo giá', x: 400, y: 178 },
      { id: 'survey', text: 'Khảo sát kỹ thuật', x: 400, y: 318 },
      { id: 'sign', text: 'Ký hợp đồng', x: 640, y: 38 },
      { id: 'deploy', text: 'Triển khai', x: 880, y: 318 },
    ],
    edges: [
      ['need', 'quote'],
      ['quote', 'survey'],
      ['survey', 'sign'],
      ['sign', 'deploy'],
    ],
  },
  {
    key: 'org',
    label: 'Sơ đồ tổ chức',
    nodes: [
      { id: 'ceo', text: 'Giám đốc', x: 380, y: 0 },
      { id: 'sales', text: 'Phòng Kinh doanh', x: 80, y: 150 },
      { id: 'tech', text: 'Phòng Kỹ thuật', x: 380, y: 150 },
      { id: 'ops', text: 'Phòng Vận hành', x: 680, y: 150 },
      { id: 's1', text: 'Nhóm khách hàng lớn', x: 80, y: 300 },
      { id: 't1', text: 'Nhóm triển khai', x: 380, y: 300 },
      { id: 'o1', text: 'Nhóm hỗ trợ', x: 680, y: 300 },
    ],
    edges: [
      ['ceo', 'sales'],
      ['ceo', 'tech'],
      ['ceo', 'ops'],
      ['sales', 's1'],
      ['tech', 't1'],
      ['ops', 'o1'],
    ],
  },
];

/** Khung phan tu Excalidraw (ExcalidrawElementSkeleton) cua mot mau. */
export function templateSkeleton(template: FlowchartTemplate): Record<string, unknown>[] {
  const byId = new Map(template.nodes.map((n) => [n.id, n]));
  const right = Math.max(...template.nodes.map((n) => n.x + (n.w ?? W))) + 60;
  const lanes = (template.lanes ?? []).flatMap((lane) => [
    {
      type: 'rectangle',
      x: 0,
      y: lane.y,
      width: right,
      height: lane.h,
      strokeStyle: 'dashed',
      backgroundColor: '#f1f5f9',
      fillStyle: 'solid',
    },
    { type: 'text', x: 12, y: lane.y + 10, text: lane.text, fontSize: 16 },
  ]);
  const nodes = template.nodes.map((n) => ({
    type: n.shape ?? 'rectangle',
    id: n.id,
    x: n.x,
    y: n.y,
    width: n.w ?? W,
    height: n.h ?? H,
    roundness: n.shape ? null : { type: 3 },
    label: { text: n.text, fontSize: 16 },
  }));
  const edges = template.edges.map(([from, to, label]) => {
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) throw new Error(`Mẫu ${template.key}: thiếu nút ${from} hoặc ${to}`);
    const [aw, ah, bw, bh] = [a.w ?? W, a.h ?? H, b.w ?? W, b.h ?? H];
    const [acx, acy, bcx, bcy] = [a.x + aw / 2, a.y + ah / 2, b.x + bw / 2, b.y + bh / 2];
    // Noi tu mep hinh nay sang mep hinh kia theo huong chiem uu the.
    const vertical = Math.abs(bcy - acy) >= Math.abs(bcx - acx);
    const sx = vertical ? acx : bcx > acx ? a.x + aw : a.x;
    const sy = vertical ? (bcy > acy ? a.y + ah : a.y) : acy;
    const ex = vertical ? bcx : bcx > acx ? b.x : b.x + bw;
    const ey = vertical ? (bcy > acy ? b.y : b.y + bh) : bcy;
    return {
      type: 'arrow',
      x: sx,
      y: sy,
      // Excalidraw coi width/height = 0 la "khong co" va dung mac dinh 100 —
      // truyen thang `points` (no trai de len gia tri tu tinh).
      width: Math.abs(ex - sx) || 1,
      height: Math.abs(ey - sy) || 1,
      points: [
        [0, 0],
        [ex - sx, ey - sy],
      ],
      start: { id: from },
      end: { id: to },
      ...(label ? { label: { text: label, fontSize: 14 } } : {}),
    };
  });
  return [...lanes, ...nodes, ...edges];
}
