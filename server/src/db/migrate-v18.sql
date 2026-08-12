/* ---------- v18: truot han, khoi luong va phu thuoc ----------
   Truoc v18, doi han mot cong viec la thao tac khong de lai dau vet: mot viec doi
   han nam lan trong khong khac gi viec dat han lan dau. Do la kieu truot tien do
   khong bao gio bi phat hien, vi tai moi thoi diem "van con thoi gian". */

/* Han LAN DAU tien duoc dat — moc so sanh co dinh. Khong bao gio ghi de sau do. */
ALTER TABLE cards ADD COLUMN baseline_due_date TEXT;
ALTER TABLE cards ADD COLUMN estimate_hours REAL;
ALTER TABLE cards ADD COLUMN spent_hours REAL NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN is_milestone INTEGER NOT NULL DEFAULT 0;

/* Du lieu cu: coi han hien tai la baseline. Khong the biet no da bi doi may lan
   truoc day, nen bat dau dem tu bay gio con hon la de trong. */
UPDATE cards SET baseline_due_date = due_date WHERE due_date IS NOT NULL;

CREATE TABLE card_due_changes (
  id INTEGER PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  old_due TEXT,
  new_due TEXT,
  reason TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_due_changes_card ON card_due_changes(card_id, changed_at DESC);

/* Phu thuoc finish-to-start: viec sau khong nen bat dau truoc khi viec truoc xong.
   Khoa chinh kep chan trung lap; chu trinh duoc chan o tang service (DFS). */
CREATE TABLE card_dependencies (
  predecessor_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  successor_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  dep_type TEXT NOT NULL DEFAULT 'FS',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (predecessor_id, successor_id)
);
CREATE INDEX idx_dependencies_successor ON card_dependencies(successor_id);
CREATE INDEX idx_cards_milestone ON cards(is_milestone, due_date) WHERE is_milestone = 1;
