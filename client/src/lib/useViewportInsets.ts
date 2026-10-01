import { useEffect } from 'react';

/** Theo doi vung nhin thay thuc te de sheet va o nhap tranh ban phim iOS. */
export function useViewportInsets() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--tr-vvh', `${vv.height}px`);
      root.style.setProperty('--tr-keyboard-inset', `${inset}px`);
      root.toggleAttribute('data-keyboard-open', inset > 120);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
