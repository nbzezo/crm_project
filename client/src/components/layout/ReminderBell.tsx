import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { formatDateTime, nowLocalInput } from '../../lib/format';
import type { Reminder } from '../../types';

export function ReminderBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ['reminders', 'upcoming'],
    queryFn: () => api.get<Reminder[]>('/api/reminders?upcoming=1'),
    refetchInterval: 60_000,
  });

  const markDone = useMutation({
    mutationFn: (id: number) => api.patch(`/api/reminders/${id}`, { is_done: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const now = nowLocalInput();
  const overdueCount = data.filter((r) => r.due_at <= now).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-panel text-tr-navfg-muted transition hover:bg-white/10 hover:text-tr-navfg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary"
        aria-label={
          overdueCount > 0
            ? `${t.reminder.reminders} — ${overdueCount} quá hạn`
            : t.reminder.reminders
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell size={18} aria-hidden="true" />
        {overdueCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-tr-danger px-1 text-[10px] font-bold text-tr-on-danger"
          >
            {overdueCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="tr-anim-pop absolute right-0 z-40 mt-1 w-[min(20rem,calc(100vw-1rem))] rounded-modal border border-tr-border bg-tr-panel shadow-xl">
            <div className="border-b border-tr-border px-4 py-2.5 text-sm font-semibold text-tr-text">
              {t.reminder.reminders}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-tr-muted">
                  {t.reminder.noReminders}
                </p>
              )}
              {data.map((r) => {
                const late = r.due_at <= now;
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-2 border-b border-tr-border px-4 py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-tr-text">{r.title}</div>
                      <div className={`text-xs ${late ? 'font-medium text-tr-danger' : 'text-tr-muted'}`}>
                        {formatDateTime(r.due_at)}
                      </div>
                      {(r.card_title || r.customer_name || r.deal_title) && (
                        <div className="truncate text-xs text-tr-muted">
                          {r.card_title ?? r.customer_name ?? r.deal_title}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => markDone.mutate(r.id)}
                      disabled={markDone.isPending}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-tr-muted transition hover:bg-tr-hover hover:text-tr-success focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tr-primary disabled:opacity-50 sm:h-8 sm:w-8"
                      aria-label={`${t.reminder.markDone}: ${r.title}`}
                    >
                      <Check size={15} aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
            <Link
              to="/tasks"
              onClick={() => setOpen(false)}
              className="block border-t border-tr-border px-4 py-2 text-center text-xs text-tr-primary hover:bg-tr-hover"
            >
              {t.nav.tasks}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
