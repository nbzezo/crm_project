import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleX, FileUp, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { DOC_TYPE_ORDER, t } from '../../i18n/vi';
import { useUiStore } from '../../stores/uiStore';
import type { Contract, Customer, Deal, Quotation } from '../../types';
import { Button, Field, Input, Select, Textarea, focusRing } from '../common/ui';
import { DOCUMENT_ACCEPT, formatBytes, MAX_UPLOAD_BYTES } from '../crm/DocumentUpload';

export interface DocumentOptions {
  customers: Customer[];
  deals: Deal[];
  contracts: Contract[];
  quotations: Quotation[];
}

type QueueStatus = 'waiting' | 'uploading' | 'done' | 'error' | 'cancelled';

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  error?: string;
}

interface UploadMetadata {
  doc_type: string;
  customer_id: string;
  deal_id: string;
  contract_id: string;
  quotation_id: string;
  description: string;
  tags: string;
  owner: string;
  effective_date: string;
  expires_at: string;
  confidentiality: 'public' | 'internal' | 'confidential';
}

const EMPTY_METADATA: UploadMetadata = {
  doc_type: 'other',
  customer_id: '',
  deal_id: '',
  contract_id: '',
  quotation_id: '',
  description: '',
  tags: '',
  owner: '',
  effective_date: '',
  expires_at: '',
  confidentiality: 'internal',
};

const allowedExtensions = new Set(DOCUMENT_ACCEPT.split(','));

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLowerCase();
}

function errorFrom(xhr: XMLHttpRequest): string {
  try {
    return (JSON.parse(xhr.responseText) as { error?: string }).error ?? 'Tải tệp thất bại';
  } catch {
    return 'Tải tệp thất bại';
  }
}

export function DocumentUploadManager({ options }: { options: DocumentOptions }) {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((state) => state.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [metadata, setMetadata] = useState<UploadMetadata>(EMPTY_METADATA);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);

  const selectedCustomer = metadata.customer_id ? Number(metadata.customer_id) : null;
  const deals = useMemo(
    () =>
      options.deals.filter((item) => !selectedCustomer || item.customer_id === selectedCustomer),
    [options.deals, selectedCustomer]
  );
  const contracts = useMemo(
    () =>
      options.contracts.filter(
        (item) => !selectedCustomer || item.customer_id === selectedCustomer
      ),
    [options.contracts, selectedCustomer]
  );
  const quotations = useMemo(
    () =>
      options.quotations.filter(
        (item) => !selectedCustomer || item.customer_id === selectedCustomer
      ),
    [options.quotations, selectedCustomer]
  );

  const setField = <K extends keyof UploadMetadata>(key: K, value: UploadMetadata[K]) =>
    setMetadata((current) => ({ ...current, [key]: value }));

  const chooseCustomer = (value: string) => {
    setMetadata((current) => ({
      ...current,
      customer_id: value,
      deal_id:
        current.deal_id &&
        options.deals.find((item) => item.id === Number(current.deal_id))?.customer_id !==
          Number(value)
          ? ''
          : current.deal_id,
      contract_id:
        current.contract_id &&
        options.contracts.find((item) => item.id === Number(current.contract_id))?.customer_id !==
          Number(value)
          ? ''
          : current.contract_id,
      quotation_id:
        current.quotation_id &&
        options.quotations.find((item) => item.id === Number(current.quotation_id))?.customer_id !==
          Number(value)
          ? ''
          : current.quotation_id,
    }));
  };

  const chooseRelation = (
    key: 'deal_id' | 'contract_id' | 'quotation_id',
    value: string,
    customerId?: number
  ) =>
    setMetadata((current) => ({
      ...current,
      [key]: value,
      customer_id: value && customerId ? String(customerId) : current.customer_id,
    }));

  const enqueue = (files: FileList | File[]) => {
    const items = Array.from(files).map<QueueItem>((file, index) => {
      const extension = extensionOf(file.name);
      const error =
        file.size > MAX_UPLOAD_BYTES
          ? `Vượt giới hạn 25 MB (${formatBytes(file.size)})`
          : !allowedExtensions.has(extension)
            ? `Định dạng ${extension || 'không xác định'} không được hỗ trợ`
            : undefined;
      return {
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        status: error ? 'error' : 'waiting',
        progress: 0,
        error,
      };
    });
    setQueue((current) => [...current, ...items]);
  };

  useEffect(() => {
    if (xhrRef.current || queue.some((item) => item.status === 'uploading')) return;
    const next = queue.find((item) => item.status === 'waiting');
    if (!next) return;

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setQueue((current) =>
      current.map((item) =>
        item.id === next.id ? { ...item, status: 'uploading', progress: 0, error: undefined } : item
      )
    );

    const body = new FormData();
    body.append('file', next.file);
    for (const [key, value] of Object.entries(metadata)) if (value) body.append(key, value);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const progress = Math.round((event.loaded / event.total) * 100);
      setQueue((current) =>
        current.map((item) => (item.id === next.id ? { ...item, progress } : item))
      );
    };
    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      setQueue((current) =>
        current.map((item) =>
          item.id === next.id
            ? {
                ...item,
                status: ok ? 'done' : 'error',
                progress: ok ? 100 : item.progress,
                error: ok ? undefined : errorFrom(xhr),
              }
            : item
        )
      );
      xhrRef.current = null;
      if (ok) queryClient.invalidateQueries({ queryKey: ['documents'] });
    };
    xhr.onerror = () => {
      setQueue((current) =>
        current.map((item) =>
          item.id === next.id
            ? { ...item, status: 'error', error: 'Mất kết nối khi tải tệp' }
            : item
        )
      );
      xhrRef.current = null;
    };
    xhr.onabort = () => {
      setQueue((current) =>
        current.map((item) =>
          item.id === next.id ? { ...item, status: 'cancelled', error: 'Đã hủy' } : item
        )
      );
      xhrRef.current = null;
    };
    xhr.open('POST', '/api/documents');
    xhr.send(body);
  }, [queue, metadata, queryClient]);

  useEffect(() => {
    const completed = queue.filter((item) => item.status === 'done').length;
    if (completed > 0 && completed === queue.length)
      pushToast(`Đã tải lên ${completed} tài liệu`, 'success');
  }, [queue, pushToast]);

  const cancel = (id: string) => {
    const item = queue.find((candidate) => candidate.id === id);
    if (item?.status === 'uploading') xhrRef.current?.abort();
    else
      setQueue((current) =>
        current.map((candidate) =>
          candidate.id === id ? { ...candidate, status: 'cancelled', error: 'Đã hủy' } : candidate
        )
      );
  };

  return (
    <section className="rounded-panel border border-tr-border bg-tr-panel p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tr-text">Tải tài liệu mới</h2>
          <p className="mt-0.5 text-xs text-tr-muted">
            Metadata và liên kết bên dưới áp dụng cho toàn bộ tệp thêm vào hàng đợi.
          </p>
        </div>
        <Button variant="primary" onClick={() => inputRef.current?.click()}>
          <Upload size={15} aria-hidden="true" /> Chọn nhiều tệp
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Loại tài liệu">
          <Select
            value={metadata.doc_type}
            onChange={(event) => setField('doc_type', event.target.value)}
          >
            {DOC_TYPE_ORDER.map((value) => (
              <option key={value} value={value}>
                {t.docType[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Khách hàng">
          <Select
            value={metadata.customer_id}
            onChange={(event) => chooseCustomer(event.target.value)}
          >
            <option value="">— Không gắn —</option>
            {options.customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cơ hội">
          <Select
            value={metadata.deal_id}
            onChange={(event) => {
              const item = options.deals.find(
                (candidate) => candidate.id === Number(event.target.value)
              );
              chooseRelation('deal_id', event.target.value, item?.customer_id);
            }}
          >
            <option value="">— Không gắn —</option>
            {deals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hợp đồng">
          <Select
            value={metadata.contract_id}
            onChange={(event) => {
              const item = options.contracts.find(
                (candidate) => candidate.id === Number(event.target.value)
              );
              chooseRelation('contract_id', event.target.value, item?.customer_id);
            }}
          >
            <option value="">— Không gắn —</option>
            {contracts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Báo giá">
          <Select
            value={metadata.quotation_id}
            onChange={(event) => {
              const item = options.quotations.find(
                (candidate) => candidate.id === Number(event.target.value)
              );
              chooseRelation('quotation_id', event.target.value, item?.customer_id);
            }}
          >
            <option value="">— Không gắn —</option>
            {quotations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code || `Báo giá #${item.id}`} · v{item.version}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chủ sở hữu">
          <Input
            value={metadata.owner}
            onChange={(event) => setField('owner', event.target.value)}
            placeholder="Tên người phụ trách"
          />
        </Field>
        <Field label="Ngày hiệu lực">
          <Input
            type="date"
            value={metadata.effective_date}
            onChange={(event) => setField('effective_date', event.target.value)}
          />
        </Field>
        <Field label="Ngày hết hạn">
          <Input
            type="date"
            value={metadata.expires_at}
            onChange={(event) => setField('expires_at', event.target.value)}
          />
        </Field>
        <Field label="Mức độ bảo mật">
          <Select
            value={metadata.confidentiality}
            onChange={(event) =>
              setField('confidentiality', event.target.value as UploadMetadata['confidentiality'])
            }
          >
            <option value="public">Công khai</option>
            <option value="internal">Nội bộ</option>
            <option value="confidential">Mật</option>
          </Select>
        </Field>
        <Field label="Thẻ" hint="Phân cách bằng dấu phẩy">
          <Input
            value={metadata.tags}
            onChange={(event) => setField('tags', event.target.value)}
            placeholder="pháp lý, 2026, đã ký"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Mô tả">
            <Textarea
              rows={2}
              value={metadata.description}
              onChange={(event) => setField('description', event.target.value)}
              placeholder="Nội dung hoặc ghi chú về tài liệu…"
            />
          </Field>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          if (event.target.files) enqueue(event.target.files);
          event.target.value = '';
        }}
      />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          enqueue(event.dataTransfer.files);
        }}
        className={`mt-4 flex min-h-24 items-center justify-center rounded-panel border border-dashed px-4 text-center transition ${dragging ? 'border-tr-primary bg-tr-primary/10' : 'border-tr-border bg-tr-surface/50'}`}
      >
        <div>
          <FileUp className="mx-auto mb-1 text-tr-muted" size={24} aria-hidden="true" />
          <p className="text-sm font-medium text-tr-text">Kéo nhiều tệp vào đây</p>
          <p className="mt-1 text-xs text-tr-muted">
            PDF, Word, Excel, PowerPoint, PNG/JPG, TXT, CSV, ZIP — tối đa 25 MB/tệp.
          </p>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-panel border border-tr-border">
          <div className="flex items-center justify-between bg-tr-surface px-3 py-2">
            <span className="text-xs font-semibold text-tr-subtle">
              Hàng đợi · {queue.length} tệp
            </span>
            <button
              type="button"
              onClick={() =>
                setQueue((current) =>
                  current.filter((item) => item.status === 'waiting' || item.status === 'uploading')
                )
              }
              className={`text-xs text-tr-primary hover:underline ${focusRing}`}
            >
              Dọn tệp đã xử lý
            </button>
          </div>
          <ul className="divide-y divide-tr-border">
            {queue.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                {item.status === 'done' ? (
                  <CheckCircle2 size={17} className="text-tr-success" />
                ) : item.status === 'error' || item.status === 'cancelled' ? (
                  <CircleX size={17} className="text-tr-danger" />
                ) : (
                  <Upload size={17} className="text-tr-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-tr-text">{item.file.name}</span>
                    <span className="shrink-0 text-tr-muted">
                      {item.status === 'uploading'
                        ? `${item.progress}%`
                        : formatBytes(item.file.size)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tr-hover">
                    <div
                      className={`h-full transition-all ${item.status === 'error' || item.status === 'cancelled' ? 'bg-tr-danger' : item.status === 'done' ? 'bg-tr-success' : 'bg-tr-primary'}`}
                      style={{ width: `${item.status === 'waiting' ? 2 : item.progress}%` }}
                    />
                  </div>
                  {item.error && <p className="mt-1 text-xs text-tr-danger">{item.error}</p>}
                </div>
                {(item.status === 'error' || item.status === 'cancelled') &&
                  allowedExtensions.has(extensionOf(item.file.name)) &&
                  item.file.size <= MAX_UPLOAD_BYTES && (
                    <button
                      type="button"
                      aria-label={`Thử lại ${item.file.name}`}
                      onClick={() =>
                        setQueue((current) =>
                          current.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, status: 'waiting', progress: 0, error: undefined }
                              : candidate
                          )
                        )
                      }
                      className={`rounded-control p-1.5 text-tr-muted hover:bg-tr-hover hover:text-tr-primary ${focusRing}`}
                    >
                      <RefreshCw size={15} />
                    </button>
                  )}
                {(item.status === 'waiting' || item.status === 'uploading') && (
                  <button
                    type="button"
                    aria-label={`Hủy ${item.file.name}`}
                    onClick={() => cancel(item.id)}
                    className={`rounded-control p-1.5 text-tr-muted hover:bg-tr-hover hover:text-tr-danger ${focusRing}`}
                  >
                    <X size={15} />
                  </button>
                )}
                {item.status !== 'uploading' && item.status !== 'waiting' && (
                  <button
                    type="button"
                    aria-label={`Bỏ ${item.file.name} khỏi hàng đợi`}
                    onClick={() =>
                      setQueue((current) => current.filter((candidate) => candidate.id !== item.id))
                    }
                    className={`rounded-control p-1.5 text-tr-muted hover:bg-tr-hover hover:text-tr-danger ${focusRing}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
