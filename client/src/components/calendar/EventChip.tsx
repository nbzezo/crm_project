import { Check, Link2 } from 'lucide-react';
import type { CalEvent } from './calendarModel';
import { OverdueIcon } from './calendarModel';

/**
 * Noi dung mot su kien trong luoi (`eventContent` cua FullCalendar).
 *
 * Muc 22 cam dung mau lam tin hieu duy nhat, nen moi chip deu co ICON + CHU;
 * mau chi la lop thong tin thu ba. Truoc day loai su kien duoc nhet vao chuoi
 * tieu de bang emoji — khong doc man hinh duoc va khong canh hang duoc.
 *
 * Chieu cao phai on dinh: `dayMaxEvents` tinh so "+N" tu chieu cao DO DUOC,
 * nen mot chip cao thap that thuong se lam con so do nhay lien tuc.
 */
export function EventChip({ item }: { item: CalEvent }) {
  return (
    <span className="flex h-full w-full min-w-0 items-center gap-1">
      {item.done ? (
        <Check size={12} className="shrink-0 opacity-90" aria-hidden="true" />
      ) : item.overdue ? (
        <OverdueIcon size={12} className="shrink-0" aria-hidden="true" />
      ) : (
        <item.Icon size={12} className="shrink-0 opacity-90" aria-hidden="true" />
      )}

      {item.time && <span className="shrink-0 text-2xs tabular-nums opacity-90">{item.time}</span>}

      <span className={`min-w-0 flex-1 truncate ${item.done ? 'line-through' : ''}`}>
        {item.title}
      </span>

      {/* Dau hieu "day chi la tham chieu, khong phai vat" — su kien sinh tu
          nguon khac thi khong sua tai cho duoc (muc 4 + phan 5.3 cua ke hoach). */}
      {!item.caps.edit && !item.caps.moveDate && (
        <Link2 size={10} className="shrink-0 opacity-70" aria-hidden="true" />
      )}
    </span>
  );
}
