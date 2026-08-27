import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, FileText, Mic, Pause, Play, Save, Sparkles, Square, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type { VoicePromptTemplate } from '../../ai/types';
import { useUiStore } from '../../stores/uiStore';
import { Button, Select, focusRing } from './ui';

type LinkTarget = { meeting_note_id: number } | { quick_note_id: number };
type Phase = 'idle' | 'recording' | 'paused' | 'recorded' | 'uploading' | 'converting';
type PendingAction = 'save' | 'convert' | null;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Ghi âm nhanh + chuyển thành văn bản bằng AI — dùng chung cho Ghi chú hộp và
 * Ghi chú nhanh (chỉ khác `linkTarget`). Ghi âm gốc được tải lên qua
 * POST /api/documents (tái dùng documentService.ts) khi người dùng bấm "Lưu
 * ghi âm" HOẶC khi bấm chuyển đổi (nếu chưa lưu) — `documentId` giữ trong
 * state để tránh tải lên hai lần và cho phép thử mẫu prompt khác mà không
 * phải ghi âm lại. Lần tải lên ĐẦU TIÊN (dù từ "Lưu" hay "Chuyển đổi") luôn
 * chèn một khối audio vào ngay dòng ghi chú qua `onInsertAudio`, để nghe lại
 * ngay trong nội dung thay vì phải mở lại từ danh sách tài liệu. Xóa bản đã
 * lưu gọi lại đúng DELETE /api/documents/:id (chuyển vào Thùng rác, khôi phục
 * được) — không có endpoint riêng nào khác.
 */
export function VoiceNoteRecorder({
  linkTarget,
  onInsertText,
  onInsertAudio,
}: {
  linkTarget: LinkTarget;
  onInsertText: (text: string) => void;
  onInsertAudio: (audio: { url: string; name: string }) => void;
}) {
  const pushToast = useUiStore((s) => s.pushToast);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<number | null>(null);
  const [templateKey, setTemplateKey] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['ai-voice-templates'],
    queryFn: () => api.get<VoicePromptTemplate[]>('/api/ai/voice-prompt-templates'),
  });

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearTimer();
  };

  const resetTake = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    blobRef.current = null;
    setAudioUrl(null);
    setDocumentId(null);
  };

  const startRecording = async () => {
    setError(null);
    resetTake();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setAudioUrl(URL.createObjectURL(blob));
        setPhase('recorded');
        stopStream();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setPhase('recording');
    } catch {
      setError('Không thể truy cập micro. Kiểm tra quyền truy cập trên trình duyệt.');
    }
  };

  const pauseRecording = () => {
    try {
      mediaRecorderRef.current?.pause();
      clearTimer();
      setPhase('paused');
    } catch {
      setError('Trình duyệt không hỗ trợ tạm dừng ghi âm.');
    }
  };

  const resumeRecording = () => {
    try {
      mediaRecorderRef.current?.resume();
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setPhase('recording');
    } catch {
      setError('Trình duyệt không hỗ trợ tiếp tục ghi âm.');
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();

  const discard = async () => {
    setError(null);
    if (documentId !== null) {
      setDeleting(true);
      try {
        await api.del(`/api/documents/${documentId}`);
      } catch {
        /* Xóa cuc bo van tiep tuc du API loi — khong chan nguoi dung o day. */
      } finally {
        setDeleting(false);
      }
    }
    resetTake();
    setPhase('idle');
    setSeconds(0);
  };

  /** Tải bản ghi lên `documents` nếu chưa có — dùng chung cho lưu-tay và chuyển đổi. */
  const ensureUploaded = async (): Promise<number> => {
    if (documentId !== null) return documentId;
    if (!blobRef.current) throw new Error('Không có bản ghi âm');
    const form = new FormData();
    form.append('file', blobRef.current, `ghi-am.${extensionFor(blobRef.current.type)}`);
    form.append('name', 'Ghi âm');
    for (const [key, value] of Object.entries(linkTarget)) form.append(key, String(value));
    const res = await fetch('/api/documents', { method: 'POST', body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Tải ghi âm thất bại');
    }
    const doc = (await res.json()) as { id: number };
    setDocumentId(doc.id);
    onInsertAudio({
      url: `/api/documents/${doc.id}/download`,
      name: `Ghi âm ${formatDuration(seconds)}`,
    });
    return doc.id;
  };

  const saveOnly = async () => {
    setError(null);
    setPendingAction('save');
    setPhase('uploading');
    try {
      await ensureUploaded();
      pushToast('Đã lưu ghi âm vào ghi chú', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu ghi âm thất bại, thử lại sau.');
    } finally {
      setPendingAction(null);
      setPhase('recorded');
    }
  };

  const convert = async () => {
    setError(null);
    setPendingAction('convert');
    try {
      setPhase('uploading');
      const docId = await ensureUploaded();
      setPhase('converting');
      const result = await api.post<{ text: string }>('/api/ai/assist/voice-note/convert', {
        document_id: docId,
        template_key: templateKey || undefined,
      });
      onInsertText(result.text);
      pushToast('Đã chèn nội dung từ ghi âm', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xử lý ghi âm thất bại, thử lại sau.');
    } finally {
      setPendingAction(null);
      setPhase('recorded');
    }
  };

  const busy = phase === 'uploading' || phase === 'converting';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {phase === 'idle' && (
        <Button size="sm" onClick={startRecording}>
          <Mic size={13} aria-hidden="true" /> Ghi âm
        </Button>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <>
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${phase === 'recording' ? 'text-tr-danger' : 'text-tr-muted'}`}
          >
            {phase === 'recording' ? (
              <span
                className="h-2 w-2 animate-pulse rounded-full bg-tr-danger"
                aria-hidden="true"
              />
            ) : (
              <span className="h-2 w-2 rounded-full bg-tr-muted" aria-hidden="true" />
            )}
            {seconds}s{phase === 'paused' ? ' · đã tạm dừng' : ''}
          </span>
          {phase === 'recording' ? (
            <Button size="sm" onClick={pauseRecording}>
              <Pause size={13} aria-hidden="true" /> Tạm dừng
            </Button>
          ) : (
            <Button size="sm" onClick={resumeRecording}>
              <Play size={13} aria-hidden="true" /> Tiếp tục
            </Button>
          )}
          <Button size="sm" onClick={stopRecording}>
            <Square size={13} aria-hidden="true" /> Kết thúc
          </Button>
        </>
      )}

      {(phase === 'recorded' || busy) && (
        <>
          {audioUrl && <audio src={audioUrl} controls className="h-8 max-w-[180px]" />}

          {documentId === null ? (
            <Button size="sm" disabled={busy} onClick={saveOnly}>
              {pendingAction === 'save' && phase === 'uploading' ? (
                'Đang lưu…'
              ) : (
                <>
                  <Save size={13} aria-hidden="true" /> Lưu ghi âm
                </>
              )}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-tr-success">
              <Check size={13} aria-hidden="true" /> Đã lưu
            </span>
          )}

          <Select
            value={templateKey}
            onChange={(event) => setTemplateKey(event.target.value)}
            disabled={busy}
            aria-label="Kiểu xử lý ghi âm"
            className="h-8 max-w-[170px] py-0 text-xs"
          >
            <option value="">— chuyển nguyên văn —</option>
            {templates.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.name}
              </option>
            ))}
          </Select>
          <Button size="sm" disabled={busy} onClick={convert}>
            {pendingAction === 'convert' && phase === 'uploading' ? (
              'Đang tải…'
            ) : phase === 'converting' ? (
              'Đang xử lý…'
            ) : templateKey ? (
              <>
                <Sparkles size={13} aria-hidden="true" /> Tóm tắt
              </>
            ) : (
              <>
                <FileText size={13} aria-hidden="true" /> Chuyển văn bản
              </>
            )}
          </Button>
          <button
            type="button"
            onClick={discard}
            disabled={busy || deleting}
            aria-label="Xóa ghi âm"
            className={`shrink-0 rounded p-1 text-tr-muted transition hover:text-tr-danger disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </>
      )}

      {error && <p className="w-full text-xs text-tr-danger">{error}</p>}
    </div>
  );
}
