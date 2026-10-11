import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Plus } from 'lucide-react';
import { api } from '../../../api/client';
import { Combobox } from '../../common/Combobox';
import {
  Button,
  ColorBadge,
  EmptyState,
  FormError,
  Panel,
  Select,
  Skeleton,
  focusRing,
} from '../../common/ui';
import { Modal } from '../../common/Modal';
import {
  CONTACT_DEPTH_LABELS,
  STANCE_ACTIONS,
  STANCE_COLORS,
  STANCE_HINTS,
  STANCE_LABELS,
} from '../../../i18n/scoring';
import { t } from '../../../i18n/vi';
import { influenceBucket, influenceValue, useDealViewMode } from '../../../lib/dealViewMode';
import type { CommitteeMember, CommitteeResponse, Deal } from '../../../types';

const stances = Object.keys(STANCE_LABELS);

/** Cot cua so do 3x3: phe doi thu va khong ung ho cung la "Phan doi"; chua ro xep chung Trung lap. */
function stanceColumn(stance: string): 'opposed' | 'neutral' | 'supporter' {
  if (stance === 'opposed' || stance === 'enemy') return 'opposed';
  if (stance === 'supporter' || stance === 'mentor') return 'supporter';
  return 'neutral';
}
export function CommitteeSimple({ deal }: { deal: Deal }) {
  const qc = useQueryClient();
  const { setMode } = useDealViewMode();
  const [adding, setAdding] = useState<number | ''>('');
  const [editing, setEditing] = useState<CommitteeMember | null>(null);
  const key = ['deal', deal.id, 'committee'];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get<CommitteeResponse>(`/api/deals/${deal.id}/committee`),
  });
  /* Doi nguoi lien quan lam doi ket luan danh gia (o #15, cau 'nguoi ung ho') — lam moi ca co hoi. */
  const refresh = () => qc.invalidateQueries({ queryKey: ['deal', deal.id] });
  const add = useMutation({
    mutationFn: (contact_id: number) => api.post(`/api/deals/${deal.id}/committee`, { contact_id }),
    onSuccess: refresh,
  });
  if (isLoading || !data) return <Skeleton className="h-64 rounded-panel" />;
  return (
    <div className="space-y-4">
      <Panel
        title="Người liên quan"
        action={<span className="text-xs text-tr-muted">{data.members.length} người</span>}
      >
        {data.members.length === 0 && (
          <EmptyState
            message="Chưa có ai trong danh sách."
            hint="Thêm những người bên khách liên quan tới quyết định mua: người dùng, người duyệt chi, người ủng hộ mình…"
          />
        )}
        <div className="space-y-2">
          {data.members.map((member) => (
            <button
              key={member.contact_id}
              type="button"
              className={`w-full rounded-control border border-tr-border p-3 text-left hover:bg-tr-hover ${focusRing}`}
              onClick={() => setEditing(member)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm text-tr-text">{member.full_name}</strong>
                <span className="text-xs text-tr-muted">
                  · {member.title || 'Chưa rõ chức danh'}
                </span>
                {member.stance === 'mentor' && (
                  <Crown size={14} className="text-tr-warning" aria-label="Người ủng hộ chính" />
                )}
                <ColorBadge color={STANCE_COLORS[member.stance]} small>
                  {STANCE_LABELS[member.stance]}
                </ColorBadge>
              </div>
              <p className="mt-1 text-xs text-tr-muted">
                {member.role ? (t.buyingRole[member.role] ?? member.role) : 'Chưa rõ vai trò'} · Nên
                làm: {STANCE_ACTIONS[member.stance]?.label ?? 'Tìm hiểu thêm'} —{' '}
                {STANCE_ACTIONS[member.stance]?.tip ?? STANCE_HINTS[member.stance]}
              </p>
            </button>
          ))}
        </div>
        {data.candidates.length > 0 && (
          <div className="mt-3 flex gap-2 border-t border-tr-border pt-3">
            <Combobox
              value={adding}
              onChange={setAdding}
              options={data.candidates.map((c) => ({
                id: c.contact_id,
                label: c.full_name,
                sublabel: c.role ? (t.buyingRole[c.role] ?? c.role) : undefined,
              }))}
              ariaLabel="Thêm người liên quan"
              placeholder="Chọn người liên hệ"
            />
            <Button
              variant="primary"
              disabled={!adding}
              onClick={() => {
                add.mutate(adding as number);
                setAdding('');
              }}
            >
              <Plus size={14} /> Thêm
            </Button>
          </div>
        )}
        <FormError error={add.error} />
      </Panel>
      <Panel>
        <details>
          <summary className={`cursor-pointer text-sm font-semibold text-tr-text ${focusRing}`}>
            Xem sơ đồ: ai ủng hộ, ai có ảnh hưởng
          </summary>
          <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <span />
            <span className="text-center text-tr-muted">Phản đối</span>
            <span className="text-center text-tr-muted">Trung lập / chưa rõ</span>
            <span className="text-center text-tr-muted">Ủng hộ</span>
            {(['high', 'medium', 'low'] as const).map((bucket) => (
              <div key={bucket} className="contents">
                <div className="flex min-h-20 items-center justify-center rounded border border-tr-border text-tr-muted">
                  Ảnh hưởng {bucket === 'high' ? 'Cao' : bucket === 'medium' ? 'Vừa' : 'Thấp'}
                </div>
                {(['opposed', 'neutral', 'supporter'] as const).map((stance) => (
                  <div
                    key={stance}
                    className="min-h-20 rounded border border-tr-border p-2 text-tr-text"
                  >
                    {data.members
                      .filter(
                        (m) =>
                          influenceBucket(m.influence) === bucket &&
                          stanceColumn(m.stance) === stance
                      )
                      .map((m) => (
                        <div key={m.contact_id}>{m.full_name}</div>
                      ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </details>
      </Panel>
      <p className="text-sm text-tr-muted">
        Sự kiện bắt buộc và đối thủ:{' '}
        <button
          type="button"
          className="text-tr-primary hover:underline"
          onClick={() => setMode('advanced')}
        >
          xem ở chế độ Nâng cao
        </button>
      </p>
      {editing && (
        <MemberModal
          deal={deal}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
function MemberModal({
  deal,
  member,
  onClose,
  onSaved,
}: {
  deal: Deal;
  member: CommitteeMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stance, setStance] = useState(member.stance);
  const [influence, setInfluence] = useState(influenceValue(influenceBucket(member.influence)));
  const [depth, setDepth] = useState(member.contact_depth ?? 'none');
  const update = useMutation({
    mutationFn: () =>
      api.patch(`/api/deals/${deal.id}/committee/${member.contact_id}`, {
        stance,
        /* Chi gui khi doi muc: neu khong, anh huong 4 se bi lam tron thanh 5 du khong ai cham. */
        ...(influenceBucket(influence) !== influenceBucket(member.influence) ? { influence } : {}),
        contact_depth: depth === 'none' ? null : depth,
      }),
    onSuccess: onSaved,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/deals/${deal.id}/committee/${member.contact_id}`),
    onSuccess: onSaved,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Sửa ${member.full_name}`}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" disabled={update.isPending} onClick={() => update.mutate()}>
            Lưu
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Thái độ</legend>
          {stances.map((value) => (
            <label key={value} className="flex gap-2 py-1 text-sm">
              <input
                type="radio"
                checked={stance === value}
                onChange={() => setStance(value as typeof stance)}
              />{' '}
              <span>
                <strong>{STANCE_LABELS[value]}</strong> — {STANCE_HINTS[value]}
              </span>
            </label>
          ))}
        </fieldset>
        <label className="block text-sm">
          Ảnh hưởng
          <Select
            value={String(influence)}
            onChange={(e) => setInfluence(Number(e.target.value) as 2 | 3 | 5)}
          >
            {[2, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n === 2 ? 'Thấp' : n === 3 ? 'Vừa' : 'Cao'}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-sm">
          Mức tiếp xúc
          <Select value={depth} onChange={(e) => setDepth(e.target.value as typeof depth)}>
            {Object.entries(CONTACT_DEPTH_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <Button variant="danger" onClick={() => remove.mutate()}>
          Gỡ khỏi danh sách
        </Button>
        <FormError error={update.error ?? remove.error} />
      </div>
    </Modal>
  );
}
