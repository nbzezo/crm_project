import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Giu vi tri cuon va dua focus ve vung noi dung moi lan doi route.
 *
 * Khong dung `<ScrollRestoration />` cua react-router duoc: no chi biet toi cua
 * so, con app nay cuon BEN TRONG `<main class="overflow-auto">` (xem App.tsx).
 *
 * Hai hanh vi tach bach, va chung khac nhau:
 *  - Bam Back/Forward (`POP`): khoi phuc dung cho da cuon toi. Danh sach khach
 *    hang dai ma quay lai bi nem ve dau trang la mot trong nhung thu buc boi
 *    nhat cua ung dung nhieu bang.
 *  - Dieu huong moi (`PUSH`/`REPLACE`): ve dau trang, va dua focus vao `<main>`
 *    de nguoi dung ban phim / trinh doc man hinh khong bi bo lai o vi tri cu
 *    trong thanh dieu huong (WCAG — focus sau khi chuyen trang).
 */

/**
 * Dat lai cho cuon, co doi noi dung cao len du.
 *
 * Luc bam Back, trang duoc dung lai tu dau: du lieu con dang tai va chunk `lazy()`
 * co the chua ve, nen phan tu cuon dang THAP hon luc roi di. Gan `scrollTop = 600`
 * vao mot khung chi cao 409 thi trinh duyet kep xuong 409, va khi noi dung cao
 * len thi khong ai chinh lai nua.
 *
 * Dung vong requestAnimationFrame chu khong phai ResizeObserver: React thay HAN
 * phan tu con khi doi tu khung xuong sang noi dung that, nen observer gan vao
 * con luc dau se nam tren mot node da bi go khoi cay va khong bao gio bao nua.
 */
function restoreScroll(node: HTMLElement, target: number, onSettled: () => void): () => void {
  let frame = 0;
  let settled = false;
  const deadline = performance.now() + 1500;

  const settle = () => {
    if (settled) return;
    settled = true;
    onSettled();
  };

  const tick = () => {
    node.scrollTop = target;
    if (Math.abs(node.scrollTop - target) < 1 || performance.now() > deadline) return settle();
    frame = requestAnimationFrame(tick);
  };

  tick();
  /* Luoi an toan: requestAnimationFrame KHONG chay khi tab bi an hoac trang
     khong ve khung hinh nao. Neu chi dua vao no thi vong nay treo mai va co
     `settling` khong bao gio duoc ha — moi thao tac cuon sau do khong con duoc
     ghi lai. setTimeout van chay trong tab nen, chi bi giam nhip. */
  const safety = window.setTimeout(settle, 1600);

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(safety);
    settle();
  };
}

export function useRouteViewport(ref: RefObject<HTMLElement | null>): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  /**
   * Bo qua su kien cuon trong khi dang on dinh trang moi.
   *
   * Hai nguon su kien cuon KHONG phai do nguoi dung tao ra deu roi vao day:
   * trinh duyet tu kep `scrollTop` khi trang moi ngan hon trang cu, va chinh
   * vong khoi phuc ben tren. Neu van ghi thi chung se de len cho da luu — do
   * chinh la ly do vi tri 600 tung bi ghi thanh 409 (chieu cao trang ke tiep).
   */
  const settling = useRef(true);

  /* Listener DONG GOI `location.key` cua chinh no thay vi doc tu ref: su kien
     cuon toi trong luc chuyen trang phai duoc ghi cho dung route dang so huu no,
     va React da lo viec go/gan listener theo dung thu tu cua tung route. */
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const key = location.key;

    const record = () => {
      if (settling.current) return;
      positions.current.set(key, node.scrollTop);
    };

    node.addEventListener('scroll', record, { passive: true });
    window.addEventListener('pagehide', record);
    return () => {
      node.removeEventListener('scroll', record);
      window.removeEventListener('pagehide', record);
    };
  }, [location.key, ref]);

  /*
   * Bat co chan NGAY SAU khi DOM cua route moi duoc gan, truoc khi trinh duyet ve.
   *
   * Phai la useLayoutEffect chu khong phai useEffect: khi trang moi ngan hon,
   * trinh duyet tu kep `scrollTop` va phat mot su kien scroll: su kien do toi
   * SAU commit nhung co the toi TRUOC useEffect, luc listener cua route cu van
   * con gan. Neu co chua bat kip thi gia tri bi kep do ghi de len cho da luu —
   * vi tri 240 tren trang khach hang tung bi ghi thanh 8 dung vi vay.
   */
  useLayoutEffect(() => {
    settling.current = true;
  }, [location.key]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const done = () => {
      settling.current = false;
    };

    if (navigationType === 'POP') {
      const saved = positions.current.get(location.key);
      if (saved !== undefined) {
        const cancel = restoreScroll(node, saved, done);
        return () => {
          done();
          cancel();
        };
      }
    }

    node.scrollTop = 0;

    /* Chi doi focus khi day la dieu huong moi. Bam Back ma bi giat focus ve dau
       noi dung se lam mat ngu canh nguoi dung vua roi khoi. `preventScroll` de
       thao tac focus khong tu keo trang di cho khac. */
    if (navigationType !== 'POP') node.focus({ preventScroll: true });

    /* Mo lai viec ghi sau khi trinh duyet da xu ly xong dot cuon do chuyen trang.
       Dung setTimeout chu khong phai requestAnimationFrame: rAF khong chay khi
       tab bi an, va neu co `settling` khong duoc ha thi tu do tro di khong con
       vi tri cuon nao duoc ghi lai nua. */
    const timer = window.setTimeout(done, 0);
    return () => {
      window.clearTimeout(timer);
      done();
    };
  }, [location.key, navigationType, ref]);
}
