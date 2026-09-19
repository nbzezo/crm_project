/**
 * Khai bao kieu cho cac import CSS dang subpath export cua package.
 *
 * `vite/client` chi khai bao module cho specifier CO DUOI `.css`. `mind-elixir/style`
 * la mot subpath export tro thang toi `dist/MindElixir.css` — khong co duoi nen
 * khong khop, va `tsc` bao TS2882 cho import side-effect o MindmapCanvas.tsx.
 * Vite van gom duoc file nay khi build; day thuan tuy la khai bao cho TypeScript.
 */
declare module 'mind-elixir/style';
