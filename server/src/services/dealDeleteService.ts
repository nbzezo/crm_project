/**
 * Xoa co hoi CO CHON LOC nhung gi xoa theo.
 *
 * Truoc day `DELETE /api/deals/:id` de khoa ngoai tu quyet dinh: bien ban hop
 * (meeting_notes, ON DELETE CASCADE) bi hard-delete — keo theo tai lieu dinh kem
 * bien ban (documents.meeting_note_id CASCADE) ma khong qua Thung rac — va nhac
 * viec cung bien mat; con tai lieu, bao gia, hop dong, cong viec, hoat dong thi
 * am tham bo lien ket. Nguoi dung khong thay va khong chon duoc gi.
 *
 * Bay gio:
 *  - `dealDeletePreview` liet ke tung muc gan voi co hoi, kem cac lien ket KHAC
 *    cua no (hop dong, bao gia, cong viec, bien ban, du an, bang) — de nguoi dung
 *    thay muc nao dang duoc dung chung truoc khi chon xoa.
 *  - `deleteDeal` chi xoa nhung muc duoc chon, theo dung duong xoa "chinh thong"
 *    cua tung loai (tai lieu va bien ban vao Thung rac, the keo tai lieu dinh kem
 *    vao Thung rac, unverifyBySource cho bang chung cham diem). Muc KHONG chon
 *    duoc giu lai, bo lien ket voi co hoi va gan ve khach hang cua co hoi neu
 *    chua gan khach hang nao, de khong mat ngu canh.
 *
 * Du lieu rieng cua co hoi (diem cham, nhom quyet dinh, moc su kien, doi thu,
 * ban giao, nhat ky thay doi, nhan, goi y ban them sinh tu co hoi) van xoa theo
 * qua CASCADE/trigger — khong co y nghia khi dung mot minh.
 */
import type { Request } from 'express';
import { db } from '../db/connection.ts';
import { assertInScope } from '../lib/scope.ts';
import { unverifyBySource } from '../lib/scoring.ts';
import { HttpError, required } from '../lib/validate.ts';
import { softDeleteDocumentsForCards } from './documentService.ts';

export const DEAL_DELETE_GROUPS = [
  'documents',
  'meeting_notes',
  'quotations',
  'contracts',
  'cards',
  'interactions',
  'reminders',
] as const;

export type DealDeleteGroup = (typeof DEAL_DELETE_GROUPS)[number];
export type DealDeleteSelection = Partial<Record<DealDeleteGroup, number[]>>;

export interface DealDeleteLink {
  kind: 'contract' | 'quotation' | 'card' | 'meeting_note' | 'project' | 'board' | 'deal';
  label: string;
}

export interface DealDeleteItem {
  id: number;
  title: string;
  /** Ngay hien canh tieu de (ISO) — ngay tao, ngay hop, han nhac... */
  date: string | null;
  /** Ma trang thai tho, giao dien tu dich (quotationStatus, contractStatus,
      interactionType) — 'done' cho cong viec/nhac viec da xong. */
  status: string | null;
  /** Cac thuc the KHAC ma muc nay con gan vao (ngoai co hoi va khach hang). */
  links: DealDeleteLink[];
  /** Ghi chu them ve hau qua khi xoa muc nay (vd. so tai lieu dinh kem). */
  note: string | null;
  /** Co gia tri thi khong cho chon xoa — ly do hien cho nguoi dung. */
  blocked: string | null;
}

export interface DealDeletePreview {
  deal: { id: number; title: string; customer_id: number };
  /** So ban ghi rieng cua co hoi luon xoa theo. */
  own: {
    scores: number;
    committee: number;
    events: number;
    competitors: number;
    handover: number;
  };
  groups: Record<DealDeleteGroup, DealDeleteItem[]>;
}

interface DealRow {
  id: number;
  title: string;
  customer_id: number;
  owner_contact_id: number | null;
}

function loadDeal(id: number): DealRow {
  return required(
    db.prepare(`SELECT id, title, customer_id, owner_contact_id FROM deals WHERE id = ?`).get(id),
    'Khong tim thay co hoi'
  ) as DealRow;
}

function count(sql: string, id: number): number {
  return (db.prepare(sql).get(id) as { n: number }).n;
}

function quotationLabel(code: string | null, version: number | null): string {
  return `${code || 'Báo giá'}${version && version > 1 ? ` (v${version})` : ''}`;
}

function link(kind: DealDeleteLink['kind'], label: string | null): DealDeleteLink[] {
  return label ? [{ kind, label }] : [];
}

export function dealDeletePreview(req: Request, id: number): DealDeletePreview {
  const deal = loadDeal(id);
  assertInScope(req, 'deals', 'delete', deal.owner_contact_id, 'Khong tim thay co hoi');

  const documents = (
    db
      .prepare(
        `SELECT d.id, d.name, d.created_at,
                k.name AS contract_name, q.code AS quotation_code, q.version AS quotation_version,
                c.title AS card_title, m.title AS note_title
           FROM documents d
           LEFT JOIN contracts k ON k.id = d.contract_id
           LEFT JOIN quotations q ON q.id = d.quotation_id
           LEFT JOIN cards c ON c.id = d.card_id
           LEFT JOIN meeting_notes m ON m.id = d.meeting_note_id
          WHERE d.deal_id = ? AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC, d.id DESC`
      )
      .all(id) as {
      id: number;
      name: string;
      created_at: string;
      contract_name: string | null;
      quotation_code: string | null;
      quotation_version: number | null;
      card_title: string | null;
      note_title: string | null;
    }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: row.name,
    date: row.created_at,
    status: null,
    links: [
      ...link('contract', row.contract_name),
      ...link(
        'quotation',
        row.quotation_code !== null || row.quotation_version !== null
          ? quotationLabel(row.quotation_code, row.quotation_version)
          : null
      ),
      ...link('card', row.card_title),
      ...link('meeting_note', row.note_title),
    ],
    note: null,
    blocked: null,
  }));

  const meetingNotes = (
    db
      .prepare(
        `SELECT m.id, m.title, m.meeting_at, p.name AS project_name,
                (SELECT COUNT(*) FROM documents d
                  WHERE d.meeting_note_id = m.id AND d.deleted_at IS NULL) AS attachments
           FROM meeting_notes m
           LEFT JOIN projects p ON p.id = m.project_id
          WHERE m.deal_id = ? AND m.deleted_at IS NULL
          ORDER BY COALESCE(m.meeting_at, m.created_at) DESC, m.id DESC`
      )
      .all(id) as {
      id: number;
      title: string;
      meeting_at: string | null;
      project_name: string | null;
      attachments: number;
    }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: row.title,
    date: row.meeting_at,
    status: null,
    links: link('project', row.project_name),
    note: row.attachments ? `${row.attachments} tài liệu đính kèm đi theo trang` : null,
    blocked: null,
  }));

  const quotations = (
    db
      .prepare(
        `SELECT q.id, q.code, q.version, q.value_vnd, q.status,
                (SELECT COUNT(*) FROM documents d
                  WHERE d.quotation_id = q.id AND d.deleted_at IS NULL) AS doc_count,
                (SELECT COUNT(*) FROM cards c WHERE c.quotation_id = q.id) AS card_count
           FROM quotations q
          WHERE q.deal_id = ?
          ORDER BY q.version DESC, q.id DESC`
      )
      .all(id) as {
      id: number;
      code: string | null;
      version: number;
      value_vnd: number;
      status: string;
      doc_count: number;
      card_count: number;
    }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: quotationLabel(row.code, row.version),
    date: null,
    status: row.status,
    links: [],
    note: keptNote(row.doc_count, row.card_count),
    blocked: null,
  }));

  const contracts = (
    db
      .prepare(
        `SELECT k.id, k.name, k.number, k.status, p.name AS project_name,
                (SELECT COUNT(*) FROM customer_services s WHERE s.contract_id = k.id) AS service_count,
                (SELECT COUNT(*) FROM documents d
                  WHERE d.contract_id = k.id AND d.deleted_at IS NULL) AS doc_count,
                (SELECT COUNT(*) FROM cards c WHERE c.contract_id = k.id) AS card_count
           FROM contracts k
           LEFT JOIN projects p ON p.id = k.project_id
          WHERE k.deal_id = ?
          ORDER BY k.id DESC`
      )
      .all(id) as {
      id: number;
      name: string;
      number: string | null;
      status: string;
      project_name: string | null;
      service_count: number;
      doc_count: number;
      card_count: number;
    }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: row.number ? `${row.name} (${row.number})` : row.name,
    date: null,
    status: row.status,
    links: link('project', row.project_name),
    note: keptNote(row.doc_count, row.card_count),
    blocked: row.service_count
      ? `Đang có ${row.service_count} dòng doanh thu tham chiếu — gỡ liên kết doanh thu trước`
      : null,
  }));

  const cards = (
    db
      .prepare(
        `SELECT c.id, c.title, c.is_done, b.name AS board_name, p.name AS project_name,
                k.name AS contract_name, q.code AS quotation_code, q.version AS quotation_version,
                (SELECT COUNT(*) FROM cards s WHERE s.parent_id = c.id) AS child_count,
                (SELECT COUNT(*) FROM documents d
                  WHERE d.card_id = c.id AND d.deleted_at IS NULL) AS doc_count
           FROM cards c
           JOIN lists l ON l.id = c.list_id
           JOIN boards b ON b.id = l.board_id
           LEFT JOIN projects p ON p.id = b.project_id
           LEFT JOIN contracts k ON k.id = c.contract_id
           LEFT JOIN quotations q ON q.id = c.quotation_id
          WHERE c.deal_id = ?
          ORDER BY c.is_done, c.id DESC`
      )
      .all(id) as {
      id: number;
      title: string;
      is_done: number;
      board_name: string;
      project_name: string | null;
      contract_name: string | null;
      quotation_code: string | null;
      quotation_version: number | null;
      child_count: number;
      doc_count: number;
    }[]
  ).map((row): DealDeleteItem => {
    const consequences = [
      row.child_count ? `${row.child_count} việc con bị xóa theo` : null,
      row.doc_count ? `${row.doc_count} tài liệu đính kèm vào Thùng rác` : null,
    ].filter(Boolean);
    return {
      id: row.id,
      title: row.title,
      date: null,
      status: row.is_done ? 'done' : null,
      links: [
        ...link('project', row.project_name),
        ...link('board', row.project_name ? null : row.board_name),
        ...link('contract', row.contract_name),
        ...link(
          'quotation',
          row.quotation_version !== null
            ? quotationLabel(row.quotation_code, row.quotation_version)
            : null
        ),
      ],
      note: consequences.length ? `Nếu xóa: ${consequences.join(', ')}` : null,
      blocked: null,
    };
  });

  const interactions = (
    db
      .prepare(
        `SELECT id, type, occurred_at, summary FROM interactions
          WHERE deal_id = ? ORDER BY occurred_at DESC, id DESC`
      )
      .all(id) as { id: number; type: string; occurred_at: string; summary: string }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: row.summary,
    date: row.occurred_at,
    status: row.type,
    links: [],
    note: null,
    blocked: null,
  }));

  const reminders = (
    db
      .prepare(
        `SELECT r.id, r.title, r.due_at, r.is_done, c.title AS card_title
           FROM reminders r
           LEFT JOIN cards c ON c.id = r.card_id
          WHERE r.deal_id = ?
          ORDER BY r.is_done, r.due_at`
      )
      .all(id) as {
      id: number;
      title: string;
      due_at: string;
      is_done: number;
      card_title: string | null;
    }[]
  ).map((row): DealDeleteItem => ({
    id: row.id,
    title: row.title,
    date: row.due_at,
    status: row.is_done ? 'done' : null,
    links: link('card', row.card_title),
    note: null,
    blocked: null,
  }));

  return {
    deal: { id: deal.id, title: deal.title, customer_id: deal.customer_id },
    own: {
      scores: count(`SELECT COUNT(*) AS n FROM deal_scores WHERE deal_id = ?`, id),
      committee: count(`SELECT COUNT(*) AS n FROM deal_committee WHERE deal_id = ?`, id),
      events: count(`SELECT COUNT(*) AS n FROM deal_events WHERE deal_id = ?`, id),
      competitors: count(`SELECT COUNT(*) AS n FROM deal_competitors WHERE deal_id = ?`, id),
      handover: count(`SELECT COUNT(*) AS n FROM deal_handover_items WHERE deal_id = ?`, id),
    },
    groups: {
      documents,
      meeting_notes: meetingNotes,
      quotations,
      contracts,
      cards,
      interactions,
      reminders,
    },
  };
}

function keptNote(docCount: number, cardCount: number): string | null {
  const parts = [
    docCount ? `${docCount} tài liệu` : null,
    cardCount ? `${cardCount} công việc` : null,
  ].filter(Boolean);
  return parts.length ? `Nếu xóa: ${parts.join(', ')} gắn kèm vẫn giữ, chỉ bỏ liên kết` : null;
}

/** Bang va dieu kien "thuoc co hoi nay" cua tung nhom — dung de kiem id gui len. */
const GROUP_SOURCE: Record<DealDeleteGroup, { table: string; extra: string; label: string }> = {
  documents: { table: 'documents', extra: 'AND deleted_at IS NULL', label: 'tài liệu' },
  meeting_notes: {
    table: 'meeting_notes',
    extra: 'AND deleted_at IS NULL',
    label: 'trang tài liệu',
  },
  quotations: { table: 'quotations', extra: '', label: 'báo giá' },
  contracts: { table: 'contracts', extra: '', label: 'hợp đồng' },
  cards: { table: 'cards', extra: '', label: 'công việc' },
  interactions: { table: 'interactions', extra: '', label: 'hoạt động' },
  reminders: { table: 'reminders', extra: '', label: 'nhắc việc' },
};

function placeholders(ids: number[]): string {
  return ids.map(() => '?').join(',');
}

export interface DealDeleteResult {
  ok: true;
  deleted: Record<DealDeleteGroup, number>;
}

export function deleteDeal(
  req: Request,
  id: number,
  selection: DealDeleteSelection
): DealDeleteResult {
  const deal = loadDeal(id);
  assertInScope(req, 'deals', 'delete', deal.owner_contact_id, 'Khong tim thay co hoi');

  const chosen = {} as Record<DealDeleteGroup, number[]>;
  for (const group of DEAL_DELETE_GROUPS) {
    const ids = [...new Set(selection[group] ?? [])];
    chosen[group] = ids;
    if (ids.length === 0) continue;
    const { table, extra, label } = GROUP_SOURCE[group];
    const { n: found } = db
      .prepare(
        `SELECT COUNT(*) AS n FROM ${table} WHERE deal_id = ? ${extra} AND id IN (${placeholders(ids)})`
      )
      .get(id, ...ids) as { n: number };
    if (found !== ids.length) {
      throw new HttpError(
        409,
        `Có ${label} đã chọn không còn thuộc cơ hội này — hãy tải lại rồi chọn lại`,
        {
          code: 'DEAL_DELETE_STALE',
        }
      );
    }
  }

  if (chosen.contracts.length) {
    /* Cung rao nhu DELETE /api/contracts/:id: quyen xoa hop dong theo chu so
       huu suy ra, va khong xoa hop dong con dong doanh thu tham chieu. */
    const rows = db
      .prepare(
        `SELECT k.name, COALESCE(d.owner_contact_id, c.owner_contact_id) AS owner_contact_id,
                (SELECT COUNT(*) FROM customer_services s WHERE s.contract_id = k.id) AS service_count
           FROM contracts k
           JOIN customers c ON c.id = k.customer_id
           LEFT JOIN deals d ON d.id = k.deal_id
          WHERE k.id IN (${placeholders(chosen.contracts)})`
      )
      .all(...chosen.contracts) as {
      name: string;
      owner_contact_id: number | null;
      service_count: number;
    }[];
    for (const row of rows) {
      assertInScope(req, 'contracts', 'delete', row.owner_contact_id, 'Khong tim thay hop dong');
      if (row.service_count > 0) {
        throw new HttpError(
          400,
          `Hợp đồng "${row.name}" đang được ${row.service_count} dòng doanh thu tham chiếu — hãy gỡ liên kết doanh thu trước khi xóa`,
          { code: 'CONTRACT_IN_USE' }
        );
      }
    }
  }

  db.transaction(() => {
    const { cards, interactions, documents, quotations, contracts, reminders } = chosen;
    const notes = chosen.meeting_notes;

    if (cards.length) {
      softDeleteDocumentsForCards(cards);
      /* softDeleteDocumentsForCards chi dat deleted_at; documents.card_id van la
         ON DELETE CASCADE nen cau DELETE cards ben duoi se hard-delete chinh cac
         dong vua vao Thung rac. Go card_id (ca the con, chau) truoc de chung o lai. */
      db.prepare(
        `WITH RECURSIVE tree(id) AS (
           SELECT id FROM cards WHERE id IN (${placeholders(cards)})
           UNION SELECT c.id FROM cards c JOIN tree t ON c.parent_id = t.id
         )
         UPDATE documents SET card_id = NULL, customer_id = COALESCE(customer_id, ?)
          WHERE card_id IN (SELECT id FROM tree)`
      ).run(...cards, deal.customer_id);
      db.prepare(`DELETE FROM cards WHERE id IN (${placeholders(cards)})`).run(...cards);
    }
    if (interactions.length) {
      for (const itemId of interactions) unverifyBySource(db, 'interaction', itemId);
      db.prepare(`DELETE FROM interactions WHERE id IN (${placeholders(interactions)})`).run(
        ...interactions
      );
    }
    if (documents.length) {
      db.prepare(
        `UPDATE documents SET deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
          WHERE id IN (${placeholders(documents)}) AND deleted_at IS NULL`
      ).run(...documents);
      for (const itemId of documents) unverifyBySource(db, 'document', itemId);
    }
    if (quotations.length) {
      db.prepare(`DELETE FROM quotations WHERE id IN (${placeholders(quotations)})`).run(
        ...quotations
      );
    }
    if (contracts.length) {
      db.prepare(`DELETE FROM contracts WHERE id IN (${placeholders(contracts)})`).run(
        ...contracts
      );
    }
    if (reminders.length) {
      db.prepare(`DELETE FROM reminders WHERE id IN (${placeholders(reminders)})`).run(
        ...reminders
      );
    }
    if (notes.length) {
      db.prepare(
        `UPDATE meeting_notes SET deleted_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
          WHERE id IN (${placeholders(notes)}) AND deleted_at IS NULL`
      ).run(...notes);
    }

    /* Muc giu lai: bo lien ket co hoi, gan ve khach hang cua co hoi neu chua co.
       meeting_notes va reminders PHAI bo lien ket truoc DELETE vi khoa ngoai cua
       chung la CASCADE — ke ca trang da o Thung rac (vua xoa o tren hoac tu truoc),
       neu khong SQLite se hard-delete chung cung tai lieu dinh kem. */
    db.prepare(
      `UPDATE meeting_notes SET deal_id = NULL, customer_id = COALESCE(customer_id, ?) WHERE deal_id = ?`
    ).run(deal.customer_id, id);
    db.prepare(
      `UPDATE reminders SET deal_id = NULL, customer_id = COALESCE(customer_id, ?) WHERE deal_id = ?`
    ).run(deal.customer_id, id);
    db.prepare(
      `UPDATE documents SET deal_id = NULL, customer_id = COALESCE(customer_id, ?) WHERE deal_id = ?`
    ).run(deal.customer_id, id);
    db.prepare(
      `UPDATE cards SET deal_id = NULL, customer_id = COALESCE(customer_id, ?) WHERE deal_id = ?`
    ).run(deal.customer_id, id);

    db.prepare(`DELETE FROM deals WHERE id = ?`).run(id);
  })();

  const deleted = {} as Record<DealDeleteGroup, number>;
  for (const group of DEAL_DELETE_GROUPS) deleted[group] = chosen[group].length;
  return { ok: true, deleted };
}
