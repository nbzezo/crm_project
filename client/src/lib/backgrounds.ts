/** Bo nen bang kieu Trello: mau don + chuyen sac. Gia tri luu thang vao boards.background. */

export const BOARD_COLORS = [
  '#0079bf',
  '#d29034',
  '#519839',
  '#b04632',
  '#89609e',
  '#cd5a91',
  '#4bbf6b',
  '#00aecc',
  '#838c91',
  '#172b4d',
];

export const BOARD_GRADIENTS = [
  'linear-gradient(140deg, #0079bf 0%, #5067c5 100%)',
  'linear-gradient(140deg, #00aecc 0%, #4bbf6b 100%)',
  'linear-gradient(140deg, #89609e 0%, #cd5a91 100%)',
  'linear-gradient(140deg, #d29034 0%, #b04632 100%)',
  'linear-gradient(140deg, #172b4d 0%, #0079bf 100%)',
  'linear-gradient(140deg, #ff8177 0%, #b12a5b 100%)',
];

export const ALL_BACKGROUNDS = [...BOARD_COLORS, ...BOARD_GRADIENTS];

/** Style nen cho bang — nhan ca ma mau lan chuoi gradient. */
export function backgroundStyle(value: string | null | undefined): React.CSSProperties {
  const background = value || BOARD_COLORS[0];
  return background.startsWith('linear-gradient')
    ? { backgroundImage: background }
    : { backgroundColor: background };
}

/** Mau dai dien (dung cho o vuong nho trong danh sach bang). */
export function isGradient(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith('linear-gradient'));
}

/** Bo mau anh bia the — dung bang mau nhan cua Trello. */
export const COVER_COLORS = [
  '#4bce97',
  '#f5cd47',
  '#fea362',
  '#f87168',
  '#9f8fef',
  '#579dff',
  '#6cc3e0',
  '#94c748',
  '#e774bb',
  '#8590a2',
];
