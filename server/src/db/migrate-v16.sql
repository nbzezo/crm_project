/* ---------- v16: vong doi trach nhiem + nhat ky nhac viec ----------
   `is_done` la 0/1 nen mot viec "dang cho khach phan hoi" va mot viec "chua ai
   dung den" trong y het nhau — khong quan duoc tien do that.

   `status` KHONG thay the `is_done`: cot cu duoc dung o ~80 cho phia may chu va
   15 file client. Hai cot ton tai song song voi bat bien is_done = 1 <=> status =
   'done', do MOT duong ghi duy nhat giu: setCardStatus() trong cardService.ts. */
ALTER TABLE cards ADD COLUMN status TEXT NOT NULL DEFAULT 'todo';
/* 'todo' | 'doing' | 'waiting_customer' | 'blocked' | 'review' | 'done' */

/* Chan viec thi phai noi ro vi sao va cho ai — mot the "blocked" khong ly do
   khong nhac duoc ai ca. blocked_since de do viec nam ket bao lau. */
ALTER TABLE cards ADD COLUMN blocked_reason TEXT;
ALTER TABLE cards ADD COLUMN blocked_since TEXT;

/* Nguoi duyet tach khoi nguoi lam: viec xong phan minh nhung cho ai do ky. */
ALTER TABLE cards ADD COLUMN approver_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;

/* Viec lap lai — JSON {"unit":"day|week|month","interval":n}. Khi chuyen sang
   'done', cardService sinh ban ke tiep trong cung transaction. */
ALTER TABLE cards ADD COLUMN recur_rule TEXT;
ALTER TABLE cards ADD COLUMN recur_until TEXT;

/* Du lieu cu: viec da hoan thanh phai vao dung o 'done', con lai giu 'todo'. */
UPDATE cards SET status = 'done' WHERE is_done = 1;

/* Nhat ky nhac — thu bien "da nhac chua" thanh so do duoc: da nhac may lan,
   lan cuoi bao gio, qua kenh nao, ho tra loi gi. */
CREATE TABLE task_nudges (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'other',
  message TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  response TEXT,
  responded_at TEXT
);
CREATE INDEX idx_nudges_card ON task_nudges(card_id, sent_at DESC);
CREATE INDEX idx_nudges_contact ON task_nudges(contact_id, sent_at DESC);
CREATE INDEX idx_cards_status ON cards(status, due_date);
