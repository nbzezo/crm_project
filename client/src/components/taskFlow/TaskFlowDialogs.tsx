import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal';
import { Button } from '../common/ui';
import { api } from '../../api/client';
import { t } from '../../i18n/vi';
import { useTaskFlowStore } from '../../stores/taskFlowStore';
import type { CardDetail } from '../../types';
import { CreateFlow } from './FlowSection';
import { refreshAfterFlowChange, useTaskFlowSettings } from './taskFlowApi';

/**
 * Hai hộp thoại của Quy trình (v66), gắn một lần ở App.
 *
 * Hàng đợi do `api/client.ts` đẩy vào (xem `stores/taskFlowStore.ts`), nên mọi chỗ
 * đổi trạng thái công việc đều được hỏi giống nhau mà không phải tự làm gì.
 */
export function TaskFlowDialogs() {
  return (
    <>
      <SkipFlowDialog />
      <FlowPromptDialog />
    </>
  );
}

/** "Quy trình chưa xong — vẫn chuyển?" khi rời một trạng thái có bước còn dở. */
function SkipFlowDialog() {
  const skips = useTaskFlowStore((s) => s.skips);
  const answerSkip = useTaskFlowStore((s) => s.answerSkip);
  const [applyAll, setApplyAll] = useState(true);
  const current = skips[0];
  if (!current) return null;
  const { details } = current;
  const rest = skips.length - 1;
  const all = rest > 0 && applyAll;

  return (
    <Modal
      open
      onClose={() => answerSkip(false, all)}
      title="Quy trình chưa xong"
      width="max-w-md"
      footer={
        <>
          <Button onClick={() => answerSkip(false, all)}>Giữ nguyên trạng thái</Button>
          <Button variant="primary" onClick={() => answerSkip(true, all)}>
            {all ? `Vẫn chuyển cả ${rest + 1} việc` : 'Vẫn chuyển'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-tr-subtle">
        Quy trình “{t.cardStatus[details.status]}” mới xong {details.done}/{details.total} bước.
        Còn lại:
      </p>
      <ol className="mt-2 list-inside list-decimal space-y-0.5 text-sm text-tr-text">
        {details.remaining.map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-tr-muted">
        Vẫn chuyển thì các bước này được giữ lại để xem, và công việc được ghi là đã bỏ qua quy
        trình.
      </p>
      {rest > 0 && (
        <label className="mt-3 flex items-center gap-2 text-sm text-tr-text">
          <input
            type="checkbox"
            checked={applyAll}
            onChange={(e) => setApplyAll(e.target.checked)}
            className="h-4 w-4 rounded border-tr-border"
          />
          Áp dụng cho cả {rest} việc còn lại trong lần này
        </label>
      )}
    </Modal>
  );
}

/** "Thêm quy trình cho trạng thái này?" khi việc vừa vào một trạng thái đặt "Luôn hỏi". */
function FlowPromptDialog() {
  const queryClient = useQueryClient();
  const prompts = useTaskFlowStore((s) => s.prompts);
  const dropPrompt = useTaskFlowStore((s) => s.dropPrompt);
  const { settings, enabled } = useTaskFlowSettings();
  const current = prompts[0];
  const { data: card } = useQuery({
    queryKey: ['card', current?.card_id],
    queryFn: () => api.get<CardDetail>(`/api/cards/${current?.card_id}`),
    enabled: current !== undefined,
  });
  if (!current || !enabled || !settings) return null;
  const rest = prompts.length - 1;
  const statusLabel = t.cardStatus[current.status];

  return (
    <Modal
      open
      onClose={() => dropPrompt()}
      title={`Thêm quy trình cho “${statusLabel}”?`}
      width="max-w-lg"
    >
      <p className="mb-3 text-sm text-tr-subtle">
        {card ? (
          <>
            <span className="font-medium text-tr-text">{card.title}</span> vừa chuyển sang “
            {statusLabel}”.
          </>
        ) : (
          `Công việc vừa chuyển sang “${statusLabel}”.`
        )}{' '}
        Quy trình là các bước làm lần lượt; xong bước cuối thì công việc tự chuyển sang “
        {t.cardStatus[settings.templates[current.status].next_status]}”.
      </p>
      <CreateFlow
        key={`${current.card_id}-${current.status}`}
        cardId={current.card_id}
        status={current.status}
        templateSteps={settings.templates[current.status].steps}
        onDone={() => {
          refreshAfterFlowChange(queryClient, current.card_id);
          dropPrompt();
        }}
        onSkip={() => dropPrompt()}
      />
      {rest > 0 && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => dropPrompt(true)}
            className="text-xs text-tr-muted underline hover:text-tr-text"
          >
            Bỏ qua cả {rest + 1} việc đang chờ hỏi
          </button>
        </div>
      )}
    </Modal>
  );
}
