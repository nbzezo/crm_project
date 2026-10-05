/* v59: link nhac yeu thich theo tung tai khoan (1.20.0).

   Truoc day danh sach link YouTube / Spotify / radio chi nam trong localStorage cua
   tung may. Luu o may chu de doi may, doi trinh duyet van con.

   Chi luu link nguoi dung dan va ten goi nho; dia chi nhung (iframe) do giao dien
   tu dung lai tu link, nen may chu khong bao gio quyet dinh trang nao duoc nhung.
   Mot link chi luu mot lan cho moi nguoi; xoa theo tai khoan. */
CREATE TABLE IF NOT EXISTS user_music_links (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS idx_user_music_links_user ON user_music_links(user_id, created_at DESC);
