import type { BoardFull } from '../../types';

export function cloneBoard(board: BoardFull): BoardFull {
  return {
    ...board,
    lists: board.lists.map((list) => ({
      ...list,
      cards: list.cards.map((card) => ({ ...card })),
    })),
  };
}

export function locateCard(
  board: BoardFull,
  cardId: number
): { listIdx: number; cardIdx: number } | null {
  for (const [listIdx, list] of board.lists.entries()) {
    const cardIdx = list.cards.findIndex((card) => card.id === cardId);
    if (cardIdx >= 0) return { listIdx, cardIdx };
  }
  return null;
}
