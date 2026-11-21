export function roundStudentScore(score: unknown): number {
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? Math.round(numericScore) : 0;
}
