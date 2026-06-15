/**
 * lib/day.ts — Consistent "study day" boundary for the app.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * Today the routes mix two different notions of "today":
 *   - "due / reviewed today" use SQLite's date('now'), which is UTC.
 *   - the streak in /api/stats uses the machine's LOCAL date
 *     (new Date().toISOString() interpreted locally).
 * In UTC-3 (and any non-UTC zone) these can disagree about which calendar day
 * "now" belongs to, so a card can be "due today" by one rule and "not reviewed
 * today" by the other. This module defines ONE rule for the whole app.
 *
 * THE RULE
 * --------
 * The study day follows the machine's LOCAL timezone and "rolls over" at
 * DAY_ROLLOVER_HOUR (Anki-style). Before that hour, the current instant still
 * counts as the PREVIOUS calendar day. With the default of 4h, anything from
 * 00:00 up to 03:59:59 local time is still "yesterday's" study day.
 *
 * HOW THE ROUTES SHOULD USE THIS (integration done later — do NOT edit routes here)
 * --------------------------------------------------------------------------------
 * Compute the day string once per request: `const today = todayStr();`
 *
 *  - "due today" (review/route.ts, stats/route.ts):
 *      replace   ... WHERE date(cs.due) <= date('now')
 *      with      ... WHERE date(cs.due) <= ?         // bind todayStr()
 *
 *  - "reviewed today" (stats/route.ts):
 *      replace   ... WHERE date(review_date) = date('now')
 *      with      ... WHERE date(review_date) = ?     // bind todayStr()
 *    NOTE: this assumes review_date is stored as a LOCAL-day string. If
 *    review_date is written via SQLite datetime('now') (UTC), prefer comparing
 *    on the application side using dayStrOf(new Date(review_date)) so the same
 *    rollover rule is applied to logged rows.
 *
 *  - streak (stats/route.ts): build the reviewed-day set with the SAME rule,
 *    i.e. map each row's review timestamp through dayStrOf(new Date(row.d)),
 *    and walk back day-by-day starting from todayStr().
 *
 * Keeping every "today" derived from todayStr()/dayStrOf() guarantees the due
 * filter, the reviewed-today count, and the streak all agree on the boundary.
 *
 * No external dependencies; pure local-time arithmetic.
 */

/** Hour (0–23, local time) at which the study day rolls over to the next date. */
export const DAY_ROLLOVER_HOUR = 4;

/** Format a Date as 'YYYY-MM-DD' using its LOCAL calendar fields. */
function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(day)}`;
}

/**
 * Study-day string ('YYYY-MM-DD') for an arbitrary instant, applying the local
 * timezone and the DAY_ROLLOVER_HOUR boundary. Instants before the rollover
 * hour map to the previous calendar day.
 */
export function dayStrOf(date: Date): string {
  // Shift back by the rollover hours, then read the LOCAL date. e.g. with
  // rollover=4, 02:00 local -> shifted to 22:00 of the previous day -> yields
  // the previous date; 05:00 local -> 01:00 same day -> yields today's date.
  const shifted = new Date(date.getTime() - DAY_ROLLOVER_HOUR * 60 * 60 * 1000);
  return formatLocalYmd(shifted);
}

/** Study-day string for the current moment (or an injected `now` for testing). */
export function todayStr(now: Date = new Date()): string {
  return dayStrOf(now);
}

/**
 * Local Date marking the start of the given study day, i.e. the rollover moment
 * (DAY_ROLLOVER_HOUR local time) on that calendar date. The study day `dayStr`
 * spans [startOfDay(dayStr), startOfDay(nextDay)).
 */
export function startOfDay(dayStr: string): Date {
  const [y, m, d] = dayStr.split("-").map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d, DAY_ROLLOVER_HOUR, 0, 0, 0);
}

/** ISO-8601 string for the start of the given study day (see startOfDay). */
export function startOfDayISO(dayStr: string): string {
  return startOfDay(dayStr).toISOString();
}

/** ISO instant of the start of TODAY's study day (the most recent rollover). */
export function startOfTodayISO(now: Date = new Date()): string {
  return startOfDayISO(todayStr(now));
}

/**
 * ISO instant of the start of the NEXT study day — the exclusive upper bound of
 * today's window. A card counts as "due today" iff its due instant is < this.
 * Because both `card_states.due` and this boundary are absolute ISO-Z instants,
 * comparing them as strings is timezone-correct regardless of where "now" is.
 */
export function startOfNextDayISO(now: Date = new Date()): string {
  const todayStart = startOfDay(todayStr(now));
  const nextDay = dayStrOf(new Date(todayStart.getTime() + 24 * 60 * 60 * 1000));
  return startOfDayISO(nextDay);
}
