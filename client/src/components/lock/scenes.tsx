import { useEffect, useState } from 'react';
import type { LockScene } from '../../stores/lockStore';
import { onLockPhotoChange, readLockPhoto } from '../../lib/lockPhoto';
import './lockScreen.css';

export const SCENE_INFO: Record<LockScene, { label: string; description: string }> = {
  photo: { label: 'Ảnh của bạn', description: 'Ảnh bạn tải lên từ máy' },
  aurora: { label: 'Cực quang', description: 'Dải sáng xanh tím trôi chậm trên nền đêm' },
  sunset: { label: 'Hoàng hôn', description: 'Mặt trời lặn sau rặng đồi' },
  night: { label: 'Đêm sao', description: 'Trăng sáng, sao lấp lánh' },
  ocean: { label: 'Biển', description: 'Sóng nhẹ lớp lớp' },
  forest: { label: 'Rừng sương', description: 'Núi rừng mờ sương buổi sớm' },
  minimal: { label: 'Tối giản', description: 'Chỉ đồng hồ trên nền tối' },
};

/** Anh nen nguoi dung tai len, cap nhat ngay khi doi o tab nay hay tab khac. */
export function useLockPhoto(): string | null {
  const [photo, setPhoto] = useState(readLockPhoto);
  useEffect(() => onLockPhotoChange(() => setPhoto(readLockPhoto())), []);
  return photo;
}

/**
 * Nen cua man cho. `thumb` = anh xem truoc dung yen trong hop Cai dat.
 * Chon "Anh cua ban" ma anh da bi xoa thi lui ve Cuc quang.
 */
export function SceneBackdrop({ scene, thumb = false }: { scene: LockScene; thumb?: boolean }) {
  const photo = useLockPhoto();
  if (scene === 'photo' && photo) {
    return (
      <div
        className={`ls-scene ls-photo ${thumb ? 'ls-thumb' : ''}`}
        style={{ backgroundImage: `url(${photo})` }}
        aria-hidden="true"
      />
    );
  }
  const drawn = scene === 'photo' ? 'aurora' : scene;
  return (
    <div className={`ls-scene ls-${drawn} ${thumb ? 'ls-thumb' : ''}`} aria-hidden="true">
      <div className="ls-layer ls-a" />
      <div className="ls-layer ls-b" />
      <div className="ls-layer ls-c" />
      <div className="ls-layer ls-d" />
    </div>
  );
}

/* Tieu de hai dong cua the chao — doi theo ngay, khong doi moi lan mo khoa. */
const HEADLINES: [string, string][] = [
  ['Một khoảng lặng.', 'Rồi ta bắt đầu lại.'],
  ['Thở chậm lại.', 'Mọi việc vẫn ổn.'],
  ['Nghỉ một chút.', 'Làm việc tốt hơn.'],
  ['Một tách trà.', 'Một ngày nhẹ nhàng.'],
  ['Thả lỏng vai.', 'Nhìn ra xa một lát.'],
  ['Từng việc một.', 'Không cần vội.'],
  ['Một khoảng riêng.', 'Một ngày tập trung.'],
];

const QUOTES = [
  'Hít một hơi thật sâu. Mọi việc vẫn ở đó, chờ bạn quay lại.',
  'Nghỉ một chút không làm bạn chậm lại, nó giúp bạn đi xa hơn.',
  'Uống một ngụm nước, nhìn ra xa, thả lỏng vai.',
  'Hôm nay bạn đã làm được nhiều hơn bạn nghĩ.',
  'Chậm lại một nhịp để nghe rõ mình hơn.',
  'Đôi mắt cũng cần được nghỉ ngơi như đôi tay.',
  'Khoảng nghỉ ngắn là món quà nhỏ cho chính mình.',
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  return Math.floor((date.getTime() - start) / 86_400_000);
}

export function headlineOfDay(date: Date): [string, string] {
  return HEADLINES[dayOfYear(date) % HEADLINES.length];
}

export function quoteOfDay(date: Date): string {
  return QUOTES[dayOfYear(date) % QUOTES.length];
}
