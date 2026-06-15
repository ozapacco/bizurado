/**
 * lib/cycle.ts — Pure logic for the topic-level study cycle.
 *
 * This module holds the I/O-free building blocks used by the planner routes:
 *   - graduate():        advance a topic's spaced-study state when it is studied
 *   - estimateMinutes(): predict how long a topic will take
 *   - updateAvg():       EMA of the user's measured pace per topic
 *
 * Keeping these pure makes them directly unit-testable without a database.
 */

import { todayStr, startOfDay } from "@/lib/day";

/** Priority -> maximum interval (in days). Higher priority = tighter ceiling. */
export const PRIORITY_CEILING: Record<number, number> = {
  5: 21,
  4: 35,
  3: 60,
  2: 90,
  1: 120,
};

export type TopicStudyStatus = "new" | "learning" | "review";

export interface GraduateInput {
  study_count: number;
  interval_days: number;
  priority: number;
}

export interface GraduateResult {
  study_count: number;
  interval_days: number;
  status: TopicStudyStatus;
  dueDayStr: string;
}

/**
 * Add `days` calendar days to a study-day string, returning a new 'YYYY-MM-DD'.
 * Anchored at startOfDay() so the local rollover rule is respected; we then read
 * back the LOCAL date fields (date-only arithmetic, DST-safe enough here).
 */
export function addDays(dayStr: string, days: number): string {
  const base = startOfDay(dayStr);
  const d = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days
  );
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Compute the next spaced-study state for a topic when it is completed.
 *
 * Mechanical expanding window with a per-priority ceiling:
 *   newCount = study_count + 1
 *   base:   1 -> 1, 2 -> 3, 3 -> 7, >=4 -> interval_days * 2.5
 *   newInterval = ceil(min(base, ceiling[priority])), minimum 1
 *   status: newCount <= 2 -> 'learning', newCount >= 3 -> 'review'
 *   dueDayStr = today + newInterval days
 */
export function graduate(
  { study_count, interval_days, priority }: GraduateInput,
  today: string = todayStr()
): GraduateResult {
  const newCount = study_count + 1;

  let base: number;
  if (newCount === 1) base = 1;
  else if (newCount === 2) base = 3;
  else if (newCount === 3) base = 7;
  else base = interval_days * 2.5;

  const ceiling = PRIORITY_CEILING[priority] ?? PRIORITY_CEILING[3];
  let newInterval = Math.ceil(Math.min(base, ceiling));
  if (newInterval < 1) newInterval = 1;

  const status: TopicStudyStatus = newCount <= 2 ? "learning" : "review";

  return {
    study_count: newCount,
    interval_days: newInterval,
    status,
    dueDayStr: addDays(today, newInterval),
  };
}

export interface EstimateInput {
  avg_minutes: number | null;
  cardCount: number;
}

/** Clamp helper. */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Estimate minutes to study a topic.
 *   - avg_minutes if measured (non-null)
 *   - else cardCount === 0 -> 20
 *   - else clamp(cardCount * 0.25, 5, 90)   (~15s per card)
 */
export function estimateMinutes({ avg_minutes, cardCount }: EstimateInput): number {
  if (avg_minutes !== null && avg_minutes !== undefined) return avg_minutes;
  if (cardCount === 0) return 20;
  return clamp(cardCount * 0.25, 5, 90);
}

/**
 * Exponential moving average of the study pace.
 *   - first measurement (avg null) -> measured
 *   - else round((0.5*avg + 0.5*measured) * 10) / 10   (1 decimal place)
 */
export function updateAvg(avg: number | null, measured: number): number {
  if (avg === null || avg === undefined) return measured;
  return Math.round((0.5 * avg + 0.5 * measured) * 10) / 10;
}

/** Default minutes spent per card before any measured pace exists (~15s). */
export const DEFAULT_MIN_PER_CARD = 0.25;

/**
 * Card-driven estimate: minutes to clear a topic's CURRENT study load — the
 * cards that are due or new right now, NOT the whole topic. As a topic matures
 * and fewer cards come due, its estimate shrinks on its own. The per-card rate
 * (min_per_card) adapts to the user's measured pace per topic.
 */
export function estimateFromNeed(
  needCount: number,
  minPerCard: number | null | undefined
): number {
  if (needCount <= 0) return 0;
  const rate =
    minPerCard !== null && minPerCard !== undefined && minPerCard > 0
      ? minPerCard
      : DEFAULT_MIN_PER_CARD;
  return clamp(Math.round(needCount * rate * 10) / 10, 1, 600);
}

/**
 * EMA of measured minutes-PER-CARD for a topic, so the pace adapts (and tends to
 * accelerate) as the user gets faster. With no signal (cardsStudied <= 0) the
 * previous value is kept unchanged.
 */
export function updateMinPerCard(
  prev: number | null,
  measuredMinutes: number,
  cardsStudied: number
): number | null {
  if (cardsStudied <= 0) return prev;
  const rate = measuredMinutes / cardsStudied;
  if (prev === null || prev === undefined) return Math.round(rate * 1000) / 1000;
  return Math.round((0.5 * prev + 0.5 * rate) * 1000) / 1000;
}
