/* Font rieng cua theme chi tai khi theme do duoc bat: cac theme con lai khong phai
   tai them. Dung <link> chu khong @import — xem ghi chu trong client/index.html.
   preconnect toi fonts.googleapis.com / fonts.gstatic.com da co san o do. */
const FONT_URLS: Partial<Record<string, string>> = {
  mono: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&display=swap',
};

export function ensureThemeFont(theme: string): void {
  const href = FONT_URLS[theme];
  if (!href) return;
  const id = `tr-font-${theme}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
