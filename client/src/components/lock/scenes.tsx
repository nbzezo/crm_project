import type { LockScene } from '../../stores/lockStore';
import './lockScreen.css';

export const SCENE_INFO: Record<LockScene, { label: string; description: string }> = {
  aurora: { label: 'Cực quang', description: 'Dải sáng xanh tím trôi chậm trên nền đêm' },
  sunset: { label: 'Hoàng hôn', description: 'Mặt trời lặn sau rặng đồi' },
  night: { label: 'Đêm sao', description: 'Trăng sáng, sao lấp lánh' },
  ocean: { label: 'Biển', description: 'Sóng nhẹ lớp lớp' },
  forest: { label: 'Rừng sương', description: 'Núi rừng mờ sương buổi sớm' },
  minimal: { label: 'Tối giản', description: 'Chỉ đồng hồ trên nền tối' },
};

/** Nen cua man cho. `thumb` = anh xem truoc dung yen trong hop Cai dat. */
export function SceneBackdrop({ scene, thumb = false }: { scene: LockScene; thumb?: boolean }) {
  return (
    <div className={`ls-scene ls-${scene} ${thumb ? 'ls-thumb' : ''}`} aria-hidden="true">
      <div className="ls-layer ls-a" />
      <div className="ls-layer ls-b" />
      <div className="ls-layer ls-c" />
      <div className="ls-layer ls-d" />
    </div>
  );
}

/* Cau nhe nhang cho man cho — doi theo ngay, khong doi moi lan mo khoa. */
const QUOTES = [
  'Hít một hơi thật sâu. Mọi việc vẫn ở đó, chờ bạn quay lại.',
  'Nghỉ một chút không làm bạn chậm lại, nó giúp bạn đi xa hơn.',
  'Uống một ngụm nước, nhìn ra xa, thả lỏng vai.',
  'Hôm nay bạn đã làm được nhiều hơn bạn nghĩ.',
  'Chậm lại một nhịp để nghe rõ mình hơn.',
  'Một tách trà, một khoảng lặng, rồi ta tiếp tục.',
  'Đôi mắt cũng cần được nghỉ ngơi như đôi tay.',
  'Không cần vội. Từng việc một là đủ.',
  'Mỉm cười một chút — bạn đang làm tốt lắm.',
  'Khoảng nghỉ ngắn là món quà nhỏ cho chính mình.',
];

export function quoteOfDay(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
