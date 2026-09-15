/**
 * Dau hieu nhan dien cua app: mot vong quy trinh HO, voi ba nut to dan chay doc
 * theo no — viec, dang lam, xong. Vong ho chu khong khep kin vi cong viec khong
 * bao gio dong hoan toan.
 *
 * Ve bang `currentColor` tren tam nen lay tu `--tr-primary`, nen logo tu doi mau
 * theo ca nam theme ma khong can biet dang o theme nao. Ban mau co dinh chi ton
 * tai o `client/public/favicon.svg`, noi khong doc duoc token CSS.
 */
export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-control bg-tr-primary text-tr-on-primary ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-[66%] w-[66%]" fill="none" aria-hidden="true">
        <path
          d="M13.94 4.76A7.5 7.5 0 1 0 19.24 10.06"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx="13.94" cy="4.76" r="1.55" fill="currentColor" />
        <circle cx="6.7" cy="17.3" r="2.2" fill="currentColor" />
        <circle cx="19.24" cy="10.06" r="2.85" fill="currentColor" />
      </svg>
    </span>
  );
}
