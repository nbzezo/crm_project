/* ---------- v26: hoan thien lop Delivery ----------

   Gom bon hang muc con lai cua dac ta vao MOT ban vi chung cham vao cung mot
   nhom bang va deu vo nghia neu thieu nhau: phan loai du an quyet dinh dung bo
   List nao, bo List sinh ra cac giai doan, giai doan la noi rui ro phat sinh, va
   nghiem thu la diem ket cua ca chuoi do.

   NGUYEN TAC XUYEN SUOT: khong tao them thuc the khi mot cot tren bang da co la
   du. Du an -> Bang (v17) da la quan he mot-nhieu; mot "giai doan/dot ban giao"
   chinh la mot Bang co han. Them bang `phases` rieng se tao ra tang thu tu ma
   moi truy van deu phai di qua, doi lay dung mot cot ngay thang. */

/* ---------- R-03: giai doan = mot Bang co han ---------- */

/* Chi mot cot ngay. Trang thai cua moc (dung han / sap tre / da tre) duoc TINH
   KHI DOC tu ngay nay va tu cac viec ben trong bang — giong `projectHealth`, va
   vi cung mot ly do: khong co su kien nao xay ra vao dung ngay qua han de kich
   hoat cap nhat, nen mot cot luu san se sai am tham tu hom sau. */
ALTER TABLE boards ADD COLUMN milestone_date TEXT;
CREATE INDEX idx_boards_milestone ON boards(project_id, milestone_date);

/* ---------- R-11: phan loai mo hinh trien khai A/B ---------- */

/* NULL = chua phan loai. He thong CHI de xuat; nguoi co tham quyen chot, va neu
   chot khac de xuat thi `model_reason` la bat buoc o tang nghiep vu (dac ta 6.3).
   Khong dat CHECK NOT NULL cho reason vi khi trung voi de xuat thi khong can. */
ALTER TABLE projects ADD COLUMN delivery_model TEXT
  CHECK (delivery_model IN ('A', 'B'));
ALTER TABLE projects ADD COLUMN model_reason TEXT;

/* ---------- R-13: nghiem thu ---------- */

ALTER TABLE projects ADD COLUMN acceptance_criteria TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN accepted_at TEXT;
ALTER TABLE projects ADD COLUMN accepted_note TEXT;

/* ---------- R-13: so rui ro / van de / thay doi / quyet dinh ---------- */

/* MOT bang cho ca bon loai thay vi bon bang.

   Chung co cung vong doi (mo -> dang xu ly -> dong), cung nguoi chiu trach nhiem,
   cung han xu ly, va nguoi dung luon xem chung tren cung mot man hinh "co gi dang
   can tro du an nay". Tach ra chi de khac moi cot `kind` se bat moi truy van
   bao cao phai UNION bon lan.

   'change' o day la Change Request cua dac ta 7.4: thay doi pham vi sau baseline
   phai di qua mot ban ghi co nguoi duyet, khong sua am tham. */
CREATE TABLE project_risks (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'risk' CHECK (kind IN ('risk', 'issue', 'change', 'decision')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'mitigating', 'closed')),
  owner_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  due_date TEXT,
  /* Ket cuc: da giam thieu the nao, hoac quyet dinh cuoi cung la gi. */
  resolution TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_project_risks ON project_risks(project_id, status, severity);

/* ---------- R-11 + R-12: cau hinh, dung lai app_settings ---------- */

/* Nguong phan loai. CAC CON SO NAY LA DIEM XUAT PHAT, KHONG PHAI CHUAN.
   500 trieu lay theo `scoring.challenge_threshold_vnd` da co trong he thong de
   hai nguong "du an lon" khong noi hai chuyen khac nhau; con lai la uoc luong
   can hieu chinh sau vai du an that. Ca bon deu sua duoc o man hinh Cai dat.

   Quy tac: vuot BAT KY nguong nao -> de xuat Mo hinh A (dac ta 6.3). */
INSERT INTO app_settings (key, value) VALUES
  ('delivery.classification', '{' ||
    '"contract_value_vnd":500000000,' ||
    '"duration_days":90,' ||
    '"phase_count":3,' ||
    '"team_count":3}'),

/* Bo List mau cho bang trien khai (R-12).

   `status` anh xa sang `lists.status_mapping` cua v19 — nho do keo the vao cot
   la doi trang thai viec, va bao cao "bao nhieu viec dang cho UAT" chay duoc ma
   khong phai doan theo ten cot. Cot khong mang nghia vong doi thi de status rong.

   'large' la chin buoc P01-P09 cua dac ta 6.4; 'small' la nam buoc cua 6.5. */
  ('delivery.board_templates', '{' ||
    '"large":[' ||
      '{"name":"P01 Khởi tạo & Bàn giao","status":"todo"},' ||
      '{"name":"P02 Backlog & Phân tích","status":"todo"},' ||
      '{"name":"P03 Cấu hình & Phát triển","status":"doing"},' ||
      '{"name":"P04 Kiểm thử nội bộ","status":"review"},' ||
      '{"name":"P05 UAT","status":"waiting_customer"},' ||
      '{"name":"P06 Đào tạo & Bàn giao","status":"doing"},' ||
      '{"name":"P07 Nghiệm thu","status":"review"},' ||
      '{"name":"P08 Hypercare","status":null},' ||
      '{"name":"P09 Hoàn tất","status":"done"}' ||
    '],' ||
    '"small":[' ||
      '{"name":"Chờ tiếp nhận","status":"todo"},' ||
      '{"name":"Đã phân công","status":"todo"},' ||
      '{"name":"Đang thực hiện","status":"doing"},' ||
      '{"name":"Chờ xác nhận khách hàng","status":"waiting_customer"},' ||
      '{"name":"Hoàn tất","status":"done"}' ||
    ']}');
