import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Upload } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button, focusRing } from '../common/ui';
import { Tabs } from '../common/Tabs';
import { feedApi, fileSize, relativeTime, type PickerDoc } from '../../lib/feed';
import { FileTypeIcon, SourceBadge } from './FeedBits';

export type PickedAttachment = {
  document_id: number;
  mode: 'view' | 'copy' | 'library';
  name: string;
  mime: string | null;
  size: number;
  source: 'personal' | 'group' | 'shared';
};

type Source = 'mine' | 'shared' | 'upload';

/**
 * Hop chon tep dinh kem: Tai lieu cua toi / Tai lieu chung / Tai tep moi.
 *
 * Tep CA NHAN phai chon cach nhom dung no — "chi xem qua bai" (mac dinh, thu hoi
 * duoc) hay "sao chep vao nhom". Tep dang gan khach hang / co hoi / hop dong thi
 * canh bao truoc: thanh vien khong co quyen voi ban ghi do van mo duoc tep.
 */
export function AttachPicker({
  open,
  onClose,
  groupId,
  groupName,
  memberCount,
  initialSource = 'mine',
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  groupId: number;
  groupName: string;
  memberCount?: number;
  initialSource?: Source;
  onPick: (items: PickedAttachment[]) => void;
}) {
  const [source, setSource] = useState<Source>(initialSource);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<Map<number, PickerDoc>>(new Map());
  const [mode, setMode] = useState<'view' | 'copy'>('view');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSource(initialSource);
      setSelected(new Map());
      setQuery('');
      setMode('view');
      setUploadError(null);
    }
  }, [open, initialSource]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const listSource = source === 'shared' ? 'shared' : 'mine';
  const docs = useQuery({
    queryKey: ['feed', 'doc-picker', listSource, debounced],
    queryFn: () => feedApi.docPicker(listSource, debounced),
    enabled: open && source !== 'upload',
  });

  const toggle = (doc: PickerDoc) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.set(doc.id, doc);
      return next;
    });

  const linked = [...selected.values()].filter(
    (doc) => doc.customer_name || doc.deal_title || doc.contract_name
  );

  const confirm = () => {
    onPick(
      [...selected.values()].map((doc) => {
        const personal = source === 'mine';
        return {
          document_id: doc.id,
          mode: personal ? mode : 'library',
          name: doc.name,
          mime: doc.mime,
          size: doc.size,
          source: personal
            ? mode === 'copy'
              ? 'group'
              : 'personal'
            : doc.group_id === groupId
              ? 'group'
              : 'shared',
        };
      })
    );
    onClose();
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const picked: PickedAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const doc = await feedApi.uploadFile(groupId, file);
        picked.push({
          document_id: doc.id,
          mode: 'library',
          name: doc.name,
          mime: doc.mime,
          size: doc.size,
          source: 'group',
        });
      }
      onPick(picked);
      onClose();
    } catch (error) {
      if (picked.length) onPick(picked);
      setUploadError(error instanceof Error ? error.message : 'Không tải được tệp');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-3xl"
      title={
        <div>
          <div>Đính kèm tài liệu</div>
          <div className="text-sm font-normal text-tr-subtle">
            Đăng vào: <b className="text-tr-text">{groupName}</b>
            {memberCount ? ` · ${memberCount} thành viên` : ''}
          </div>
        </div>
      }
      footer={
        source === 'upload' ? (
          <Button onClick={onClose}>Đóng</Button>
        ) : (
          <>
            <span className="mr-auto self-center text-sm text-tr-subtle">
              Đã chọn {selected.size} tệp
            </span>
            <Button onClick={onClose}>Hủy</Button>
            <Button variant="primary" disabled={selected.size === 0} onClick={confirm}>
              Đính kèm
            </Button>
          </>
        )
      }
    >
      <Tabs
        value={source}
        onChange={(value) => {
          setSource(value);
          setSelected(new Map());
        }}
        ariaLabel="Nguồn tài liệu"
        idPrefix="attach-source"
        items={[
          { value: 'mine', label: 'Tài liệu của tôi' },
          { value: 'shared', label: 'Tài liệu chung' },
          { value: 'upload', label: 'Tải tệp mới' },
        ]}
      >
        <div className="space-y-3 pt-3">
          {source === 'upload' ? (
            <div className="space-y-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className={`flex w-full flex-col items-center gap-2 rounded-panel border border-dashed border-tr-border bg-tr-card px-4 py-10 text-sm text-tr-subtle hover:bg-tr-hover ${focusRing}`}
              >
                <Upload size={24} aria-hidden="true" />
                {uploading ? 'Đang tải lên…' : 'Chọn tệp từ máy (tối đa 25 MB mỗi tệp)'}
                <span className="text-xs text-tr-muted">
                  Tệp được lưu vào tài liệu của nhóm — mọi thành viên xem được.
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => {
                  void uploadFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              {uploadError && (
                <p role="alert" className="text-sm text-tr-danger">
                  {uploadError}
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="flex h-10 items-center gap-2 rounded-control border border-tr-border bg-tr-card px-3 focus-within:outline-2 focus-within:outline-tr-primary">
                <Search size={15} className="text-tr-muted" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={
                    source === 'mine' ? 'Tìm trong tài liệu của tôi…' : 'Tìm trong tài liệu chung…'
                  }
                  aria-label="Tìm tài liệu"
                  className="min-w-0 flex-1 bg-transparent text-sm text-tr-text outline-none placeholder:text-tr-muted"
                />
              </label>
              <div className="max-h-[22rem] overflow-y-auto rounded-panel border border-tr-border">
                {docs.isLoading ? (
                  <p className="p-4 text-sm text-tr-muted">Đang tải…</p>
                ) : (docs.data ?? []).length === 0 ? (
                  <p className="p-4 text-sm text-tr-muted">
                    {source === 'mine'
                      ? 'Bạn chưa có tài liệu cá nhân nào khớp. Dùng "Tải tệp mới" để đưa tệp vào nhóm.'
                      : 'Không có tài liệu chung nào khớp.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-tr-border">
                    {(docs.data ?? []).map((doc) => {
                      const linkText = [doc.customer_name, doc.deal_title, doc.contract_name]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <li key={doc.id}>
                          <label
                            className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${
                              selected.has(doc.id) ? 'bg-tr-primary/5' : 'hover:bg-tr-hover'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(doc.id)}
                              onChange={() => toggle(doc)}
                              className="h-4 w-4 accent-tr-primary"
                            />
                            <FileTypeIcon name={doc.file_name} mime={doc.mime} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-tr-text">
                                {doc.name}
                              </span>
                              <span className="block truncate text-xs text-tr-subtle">
                                {relativeTime(doc.updated_at)} · {fileSize(doc.size)}
                                {source === 'shared' && doc.owner_name
                                  ? ` · ${doc.owner_name}`
                                  : ''}
                                {doc.group_name ? ` · nhóm ${doc.group_name}` : ''}
                                {linkText ? ` · gắn ${linkText}` : ''}
                              </span>
                            </span>
                            <SourceBadge
                              source={
                                source === 'mine' ? 'personal' : doc.group_id ? 'group' : 'shared'
                              }
                            />
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {source === 'mine' && (
                <fieldset className="space-y-2 rounded-panel border border-tr-border px-3.5 py-3">
                  <legend className="px-1 text-sm font-semibold text-tr-text">
                    Thành viên nhóm sẽ dùng tệp cá nhân này thế nào?
                  </legend>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="attach-mode"
                      checked={mode === 'view'}
                      onChange={() => setMode('view')}
                      className="mt-1 h-4 w-4 accent-tr-primary"
                    />
                    <span className="text-sm">
                      <b className="text-tr-text">Chỉ xem qua bài viết</b>{' '}
                      <span className="text-xs font-semibold text-tr-success">Khuyên dùng</span>
                      <span className="block text-xs text-tr-subtle">
                        Tệp vẫn thuộc về bạn. Thành viên nhóm xem và tải về được khi mở bài. Gỡ đính
                        kèm hoặc xóa bài là thu hồi quyền.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="radio"
                      name="attach-mode"
                      checked={mode === 'copy'}
                      onChange={() => setMode('copy')}
                      className="mt-1 h-4 w-4 accent-tr-primary"
                    />
                    <span className="text-sm">
                      <b className="text-tr-text">Sao chép vào tài liệu của nhóm</b>
                      <span className="block text-xs text-tr-subtle">
                        Tạo bản sao thuộc nhóm, hiện trong kho tài liệu của mọi thành viên. Bản gốc
                        của bạn không đổi.
                      </span>
                    </span>
                  </label>
                </fieldset>
              )}

              {source === 'shared' && (
                <p className="text-xs text-tr-subtle">
                  Tài liệu chung giữ nguyên quyền của nó: thành viên không có quyền với tệp sẽ thấy
                  “Tệp bị giới hạn”, trừ khi tệp được đặt mức bảo mật Công khai.
                </p>
              )}

              {source === 'mine' && linked.length > 0 && (
                <p className="rounded-control bg-tr-warning/20 px-3 py-2 text-xs text-tr-text">
                  {linked.length === 1 ? 'Tệp này' : `${linked.length} tệp`} đang gắn với{' '}
                  <b>
                    {[linked[0].customer_name, linked[0].deal_title, linked[0].contract_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </b>
                  . Thành viên nhóm không có quyền với bản ghi đó vẫn xem được tệp — hãy chắc tệp
                  không chứa thông tin họ không được biết.
                </p>
              )}
            </>
          )}
        </div>
      </Tabs>
    </Modal>
  );
}
