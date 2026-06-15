const K = 32
const SCALE = 400
export const INITIAL_SCORE = 1500

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / SCALE))
}

export function updateRatings(
  winnerRating: number,
  loserRating: number,
): { winner: number; loser: number } {
  const expected = expectedScore(winnerRating, loserRating)
  return {
    winner: Math.round(winnerRating + K * (1 - expected)),
    loser: Math.round(loserRating + K * (0 - (1 - expected))),
  }
}
