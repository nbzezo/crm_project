import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

/**
 * Loi thong bao tieng Viet cho moi thao tac keo tha.
 *
 * dnd-kit mac dinh doc bang tieng Anh ("Draggable item was moved over droppable
 * area…"), lac han trong mot ung dung tieng Viet — va truoc day chi bang Kanban
 * co ban dich rieng, ba cho con lai (Pipeline, Ghi chu nhanh, thanh dieu huong)
 * van doc tieng Anh.
 *
 * `resolve` doi id ky thuat sang ten nguoi doc hieu duoc. Khong co no thi trinh
 * doc man hinh phat ra "Dang giu card-17" — dung ky thuat, vo nghia voi nguoi
 * nghe. Chua co ten thi rot ve mot danh tu chung thay vi doc id tho.
 */
export interface AnnouncementOptions {
  /** Ten loai muc dang keo, vi du 'thẻ', 'cơ hội', 'ghi chú', 'mục điều hướng'. */
  itemNoun: string;
  /** Doi id sang nhan doc duoc; tra ve null neu khong tra duoc. */
  resolve?: (id: string) => string | null;
}

export function buildDndAnnouncements({ itemNoun, resolve }: AnnouncementOptions): Announcements {
  const name = (id: string | number): string => resolve?.(String(id)) ?? itemNoun;

  return {
    onDragStart: ({ active }) =>
      `Đang giữ ${name(active.id)}. Dùng phím mũi tên để di chuyển, Space để thả, Escape để hủy.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${name(active.id)} đang ở trên ${name(over.id)}.`
        : `${name(active.id)} đang ở ngoài vùng thả.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `Đã thả ${name(active.id)} vào ${name(over.id)}.`
        : `Đã hủy. ${name(active.id)} trở về vị trí cũ.`,
    onDragCancel: ({ active }) => `Đã hủy kéo thả. ${name(active.id)} trở về vị trí cũ.`,
  };
}

/** Huong dan doc mot lan khi nguoi dung focus vao tay cam keo. */
export function dndInstructions(itemNoun: string): ScreenReaderInstructions {
  return {
    draggable:
      `Nhấn Space hoặc Enter để bắt đầu kéo ${itemNoun}. ` +
      'Khi đang kéo, dùng phím mũi tên để di chuyển. ' +
      'Nhấn Space hoặc Enter lần nữa để thả, hoặc Escape để hủy.',
  };
}
