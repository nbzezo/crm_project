import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Send, Unlink } from 'lucide-react';
import { api } from '../../api/client';
import { Button, Input, focusRing } from '../common/ui';
import { Toggle } from './SettingsKit';
import { useUiStore } from '../../stores/uiStore';

/*
 * Telegram cua toi (1.35.0): moi nguoi tu noi Telegram rieng voi bot cua cong ty va
 * chon thong bao muon nhan. Chi dung toi tai khoan cua chinh minh.
 */

interface MyTelegram {
  bot_ready: boolean;
  bot_username: string | null;
  has_contact: boolean;
  linked: boolean;
  tg_name: string | null;
  linked_at: string | null;
  enabled: boolean;
  notify_tasks: boolean;
  notify_reminders: boolean;
  notify_assignee: boolean;
  notify_feed: boolean;
  pending_link: { url: string; expires_at: string } | null;
}

type Pref = 'enabled' | 'notify_tasks' | 'notify_reminders' | 'notify_assignee' | 'notify_feed';
const KEY = ['me', 'telegram'] as const;

export function MyTelegramSettings() {
  const queryClient = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  const [manualOpen, setManualOpen] = useState(false);
  const [chatId, setChatId] = useState('');
  const status = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<MyTelegram>('/api/me/telegram'),
    /* Dang cho nguoi dung bam Start trong Telegram: hoi lai moi 3 giay. */
    refetchInterval: (query) => (query.state.data?.pending_link ? 3_000 : false),
  });
  const data = status.data;
  const set = (next: MyTelegram) => queryClient.setQueryData(KEY, next);
  const onError = (error: unknown) =>
    pushToast(error instanceof Error ? error.message : 'Không thực hiện được');

  const link = useMutation({
    mutationFn: () => api.post<MyTelegram>('/api/me/telegram/link'),
    onSuccess: (next) => {
      set(next);
      if (next.pending_link) window.open(next.pending_link.url, '_blank', 'noopener');
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (patch: Partial<Record<Pref, boolean>>) =>
      api.put<MyTelegram>('/api/me/telegram', patch),
    onSuccess: set,
    onError,
  });
  const manual = useMutation({
    mutationFn: () => api.post<MyTelegram>('/api/me/telegram/manual', { chat_id: chatId.trim() }),
    onSuccess: (next) => {
      set(next);
      setManualOpen(false);
      pushToast('Đã kết nối Telegram', 'success');
    },
    onError,
  });
  const test = useMutation({
    mutationFn: () => api.post('/api/me/telegram/test'),
    onSuccess: () => pushToast('Đã gửi tin thử — mở Telegram để xem', 'success'),
    onError,
  });
  const unlink = useMutation({
    mutationFn: () => api.del<MyTelegram>('/api/me/telegram'),
    onSuccess: set,
    onError,
  });

  /* Vua noi xong (dang cho -> da noi): bao mot lan. */
  const [wasPending, setWasPending] = useState(false);
  useEffect(() => {
    if (data?.pending_link) setWasPending(true);
    else if (wasPending && data?.linked) {
      setWasPending(false);
      pushToast('Đã kết nối Telegram', 'success');
    }
  }, [data, wasPending, pushToast]);

  if (status.isLoading || !data) return <p className="text-sm text-tr-muted">Đang tải…</p>;

  if (!data.bot_ready) {
    return (
      <p className="rounded-control bg-tr-warning/20 px-3 py-2 text-sm text-tr-text">
        Bot Telegram của công ty chưa được bật. Nhờ quản trị cấu hình ở Cài đặt → Telegram, sau đó
        quay lại đây để kết nối Telegram của bạn.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {data.linked ? (
        <section className="flex flex-wrap items-center gap-3 rounded-panel border border-tr-border bg-tr-card p-4">
          <CheckCircle2 size={22} className="text-tr-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-tr-text">Đã kết nối {data.tg_name}</div>
            <div className="text-xs text-tr-subtle">
              Thông báo của bạn được gửi riêng tới tài khoản Telegram này qua bot
              {data.bot_username ? ` @${data.bot_username}` : ''}.
            </div>
          </div>
          <Button onClick={() => test.mutate()} disabled={test.isPending}>
            <Send size={14} aria-hidden="true" /> Gửi thử
          </Button>
          <Button variant="danger" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
            <Unlink size={14} aria-hidden="true" /> Ngắt kết nối
          </Button>
        </section>
      ) : (
        <section className="space-y-3 rounded-panel border border-tr-border bg-tr-card p-4">
          <h3 className="text-sm font-semibold text-tr-text">Kết nối Telegram của bạn</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-tr-subtle">
            <li>Bấm “Mở Telegram để kết nối”.</li>
            <li>
              Telegram mở bot {data.bot_username ? <b>@{data.bot_username}</b> : 'của công ty'} —
              bấm <b>Start / Bắt đầu</b>.
            </li>
            <li>Quay lại đây: trang tự nhận kết nối trong vài giây.</li>
          </ol>
          {data.pending_link ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={data.pending_link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`tr-button tr-button-primary inline-flex min-h-[44px] items-center gap-1.5 rounded-control bg-tr-primary px-4 text-sm font-medium text-tr-on-primary hover:bg-tr-primary-hover fine:min-h-[32px] ${focusRing}`}
              >
                <ExternalLink size={15} aria-hidden="true" /> Mở lại Telegram
              </a>
              <span role="status" className="text-xs text-tr-subtle">
                Đang chờ bạn bấm Start… (mã hết hạn lúc {data.pending_link.expires_at.slice(11, 16)}
                )
              </span>
            </div>
          ) : (
            <Button variant="primary" onClick={() => link.mutate()} disabled={link.isPending}>
              <ExternalLink size={15} aria-hidden="true" /> Mở Telegram để kết nối
            </Button>
          )}
          <div>
            <button
              type="button"
              onClick={() => setManualOpen((open) => !open)}
              aria-expanded={manualOpen}
              className={`text-xs text-tr-primary hover:underline ${focusRing}`}
            >
              Hoặc nhập Chat ID thủ công (ví dụ nhóm Telegram riêng)
            </button>
            {manualOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={chatId}
                  onChange={(event) => setChatId(event.target.value)}
                  placeholder="Chat ID, ví dụ 123456789"
                  aria-label="Chat ID Telegram"
                  inputMode="numeric"
                  className="max-w-[14rem]"
                />
                <Button
                  disabled={!chatId.trim() || manual.isPending}
                  onClick={() => manual.mutate()}
                >
                  Gửi thử và lưu
                </Button>
                <span className="text-xs text-tr-muted">
                  Phải bấm Start với bot trước, bot mới gửi được tin cho bạn.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-tr-text">Nhận những thông báo nào</h3>
        {!data.has_contact && (
          <p className="text-xs text-tr-subtle">
            Tài khoản chưa gắn hồ sơ nhân sự nên chưa có việc, nhắc hẹn hay Bảng tin để báo.
          </p>
        )}
        <Toggle
          checked={data.enabled}
          onChange={(value) => update.mutate({ enabled: value })}
          label="Bật thông báo Telegram"
          description="Tắt để tạm ngừng mọi tin mà không phải ngắt kết nối."
        />
        <div className={`space-y-3 ${data.enabled ? '' : 'opacity-60'}`}>
          <Toggle
            checked={data.notify_tasks}
            disabled={!data.enabled}
            onChange={(value) => update.mutate({ notify_tasks: value })}
            label="Việc của tôi đến hạn"
            description="Việc được giao cho bạn tới hạn hoặc quá hạn (mỗi việc một lần mỗi hạn)."
          />
          <Toggle
            checked={data.notify_reminders}
            disabled={!data.enabled}
            onChange={(value) => update.mutate({ notify_reminders: value })}
            label="Nhắc hẹn và ghi chú nhanh của tôi"
            description="Đúng giờ hẹn bạn đã đặt."
          />
          <Toggle
            checked={data.notify_assignee}
            disabled={!data.enabled}
            onChange={(value) => update.mutate({ notify_assignee: value })}
            label="Khi tôi được giao việc mới"
          />
          <Toggle
            checked={data.notify_feed}
            disabled={!data.enabled}
            onChange={(value) => update.mutate({ notify_feed: value })}
            label="Bảng tin nhóm"
            description="Khi bạn được nhắc tên, có thông báo mới, có bình luận vào bài của bạn hoặc bài chờ bạn duyệt."
          />
        </div>
      </section>
    </div>
  );
}
