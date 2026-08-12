-- v12: quan ly tai lieu — metadata, phan loai bao mat va thung rac.
ALTER TABLE documents ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN owner TEXT;
ALTER TABLE documents ADD COLUMN effective_date TEXT;
ALTER TABLE documents ADD COLUMN expires_at TEXT;
ALTER TABLE documents ADD COLUMN confidentiality TEXT NOT NULL DEFAULT 'internal'
  CHECK (confidentiality IN ('public','internal','confidential'));
ALTER TABLE documents ADD COLUMN deleted_at TEXT;
ALTER TABLE documents ADD COLUMN updated_at TEXT;

UPDATE documents SET updated_at = created_at WHERE updated_at IS NULL;

CREATE INDEX idx_documents_deleted ON documents(deleted_at, created_at DESC);
CREATE INDEX idx_documents_expiry ON documents(expires_at) WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
