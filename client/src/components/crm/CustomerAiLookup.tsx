import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, Globe, Search, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import { Button, FormError, Input } from '../common/ui';
import { t } from '../../i18n/vi';
import {
  CUSTOMER_ASSIST_FIELDS,
  type CustomerAssistField,
  type CustomerAssistResult,
} from '../../ai/types';

const WEB_SEARCH_PREF = 'workflow.customerAi.webSearch';

function readWebSearchPref(): boolean {
  try {
    return localStorage.getItem(WEB_SEARCH_PREF) !== 'off';
  } catch {
    return true;
  }
}

const FIELD_LABELS: Record<CustomerAssistField, string> = {
  name: t.customer.name,
  short_name: t.customer.shortName,
  tax_code: t.customer.taxCode,
  industry: t.customer.industry,
  address: t.customer.address,
  website: t.customer.website,
  phone: t.customer.phone,
  email: t.customer.email,
  size: t.customer.size,
  notes: t.customer.notes,
};

/**
 * Tra cứu doanh nghiệp bằng MST hoặc tên rồi đề xuất điền form khách hàng.
 *
 * Chỉ đề xuất: người dùng chọn trường nào áp dụng. Mặc định chỉ tích các ô đang
 * trống — gợi ý không được lặng lẽ ghi đè thứ người dùng đã gõ.
 */
export function CustomerAiLookup({
  current,
  onApply,
}: {
  current: Record<CustomerAssistField, string>;
  onApply: (values: Partial<Record<CustomerAssistField, string>>) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<CustomerAssistResult | null>(null);
  const [selected, setSelected] = useState<CustomerAssistField[]>([]);
  const [applied, setApplied] = useState<string[]>([]);
  /* Bat san: AI chi tim web khi kien thuc san co chua du. Tat de nhanh va re hon. */
  const [webSearch, setWebSearch] = useState(readWebSearchPref);

  /* Ô tra cứu để trống thì dùng MST, rồi tới tên đã gõ trong form. */
  const effectiveQuery = query.trim() || current.tax_code.trim() || current.name.trim();

  const lookup = useMutation({
    mutationFn: () =>
      api.post<CustomerAssistResult>('/api/ai/assist/customer', {
        query: effectiveQuery,
        web_search: webSearch,
      }),
    onSuccess: (data) => {
      setResult(data);
      setSelected(
        CUSTOMER_ASSIST_FIELDS.filter((field) => data.suggestion[field] && !current[field].trim())
      );
    },
  });

  const fields = result ? CUSTOMER_ASSIST_FIELDS.filter((field) => result.suggestion[field]) : [];

  const apply = () => {
    if (!result) return;
    onApply(Object.fromEntries(selected.map((field) => [field, result.suggestion[field]!])));
    setApplied(selected.map((field) => FIELD_LABELS[field]));
    setResult(null);
  };

  return (
    <div className="mb-4 rounded-panel border border-tr-border bg-tr-list p-3">
      <label htmlFor="customer-ai-lookup" className="text-sm font-semibold text-tr-text">
        <Sparkles size={14} className="mr-1 inline text-tr-primary" aria-hidden="true" />
        Tìm thông tin bằng AI
      </label>
      <p className="mt-0.5 text-xs text-tr-muted">
        Gõ mã số thuế hoặc tên công ty — MST được đối chiếu với cơ sở dữ liệu đăng ký doanh nghiệp,
        AI bổ sung ngành nghề, quy mô, website.
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (effectiveQuery.length >= 2 && !lookup.isPending) lookup.mutate();
        }}
      >
        <Input
          id="customer-ai-lookup"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            current.tax_code.trim() || current.name.trim() || 'VD: 0101248141 hoặc Vinamilk'
          }
        />
        <Button
          type="submit"
          variant="primary"
          className="shrink-0"
          disabled={effectiveQuery.length < 2 || lookup.isPending}
        >
          <Search size={15} aria-hidden="true" />
          {lookup.isPending ? 'Đang tìm…' : 'Tìm'}
        </Button>
      </form>
      <label className="mt-2 inline-flex items-center gap-2 text-xs text-tr-subtle">
        <input
          type="checkbox"
          checked={webSearch}
          onChange={(event) => {
            setWebSearch(event.target.checked);
            try {
              localStorage.setItem(WEB_SEARCH_PREF, event.target.checked ? 'on' : 'off');
            } catch {
              /* Trinh duyet chan luu tru — chi mat ghi nho lua chon. */
            }
          }}
        />
        Cho phép AI tìm trên web khi cần (chậm hơn; Gemini, Claude hoặc 9Router có model tìm kiếm)
      </label>
      <FormError error={lookup.error} />

      {result && (
        <div className="mt-3 rounded-panel border border-tr-primary/30 bg-tr-primary/5 p-3">
          {fields.length > 0 && (
            <>
              <p className="text-sm font-semibold text-tr-text">
                Đề xuất — chọn trường muốn điền vào biểu mẫu
              </p>
              <div className="mt-2 space-y-2">
                {fields.map((field) => {
                  const value = result.suggestion[field]!;
                  const existing = current[field].trim();
                  return (
                    <label key={field} className="flex items-start gap-2 text-sm text-tr-subtle">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.includes(field)}
                        onChange={(event) =>
                          setSelected((prev) =>
                            event.target.checked
                              ? [...prev, field]
                              : prev.filter((key) => key !== field)
                          )
                        }
                      />
                      <span className="min-w-0">
                        <strong className="text-tr-text">{FIELD_LABELS[field]}:</strong>{' '}
                        <span className="break-words">{value}</span>{' '}
                        {result.sources[field] === 'registry' ? (
                          <span className="inline-flex items-center gap-0.5 text-xs text-tr-success">
                            <BadgeCheck size={12} aria-hidden="true" /> Đã xác thực
                          </span>
                        ) : (
                          <span className="text-xs text-tr-warning">AI · cần kiểm tra</span>
                        )}
                        {existing && existing !== value && (
                          <span className="block text-xs text-tr-muted">Đang có: {existing}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {result.warnings.map((warning) => (
            <p key={warning} className="mt-2 text-xs text-tr-danger">
              {warning}
            </p>
          ))}
          {result.rationale && (
            <p className="mt-2 text-xs text-tr-subtle">Căn cứ: {result.rationale}</p>
          )}
          {result.web_sources.length > 0 && (
            <div className="mt-2 text-xs text-tr-subtle">
              <p className="inline-flex items-center gap-1 font-medium text-tr-text">
                <Globe size={12} aria-hidden="true" /> Nguồn trên web
              </p>
              <ul className="mt-0.5 space-y-0.5">
                {result.web_sources.map((source) => (
                  <li key={source.url} className="truncate">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-tr-primary underline"
                    >
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {fields.length > 0 && (
              <Button variant="primary" disabled={selected.length === 0} onClick={apply}>
                Áp dụng đã chọn
              </Button>
            )}
            <Button onClick={() => setResult(null)}>Bỏ gợi ý</Button>
          </div>
        </div>
      )}

      {applied.length > 0 && !result && (
        <p className="mt-2 text-xs text-tr-subtle">
          <span className="inline-flex items-center gap-1 font-semibold text-tr-text">
            <Sparkles size={12} aria-hidden="true" /> Đã điền: {applied.join(', ')}
          </span>{' '}
          — hãy kiểm tra trước khi lưu.
        </p>
      )}
    </div>
  );
}
