export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

/** Splits totalCents evenly across participantCount shares, distributing the
 * leftover pennies (from integer division) one-by-one to the first N shares
 * so the shares always sum back to exactly totalCents. */
export function splitEvenlyCents(totalCents: number, participantCount: number): number[] {
  if (participantCount <= 0) {
    throw new Error("participantCount must be greater than 0");
  }
  const base = Math.floor(totalCents / participantCount);
  const remainder = totalCents - base * participantCount;
  return Array.from({ length: participantCount }, (_, i) => base + (i < remainder ? 1 : 0));
}
