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
  for (let listIdx = 0; listIdx < board.lists.length; listIdx += 1) {
    const cardIdx = board.lists[listIdx].cards.findIndex((card) => card.id === cardId);
    if (cardIdx >= 0) return { listIdx, cardIdx };
  }
  return null;
}
