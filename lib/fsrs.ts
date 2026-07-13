// FSRS-4.5 canonical implementation with learning / relearning steps.
// The 17 default weights below are the official FSRS-4.5 defaults — do NOT change them.
const FSRS_PARAMS = {
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
};

// Configurable FSRS-4.5 constants.
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
export const REQUEST_RETENTION = 0.9;
export const MAX_INTERVAL = 36500; // days

// Learning / relearning steps in minutes.
export const LEARNING_STEPS_MIN = [1, 10];
export const RELEARNING_STEPS_MIN = [10];

export type Rating = 1 | 2 | 3 | 4;
export const RatingMap = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;

export type CardStateName = "new" | "learning" | "review" | "relearning";

export interface CardState {
  stability: number;
  difficulty: number;
  due: string;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review: string | null;
  state: string;
  learning_step: number;
}

export function createInitialState(now: Date = new Date()): CardState {
  return {
    stability: 0,
    difficulty: 0,
    due: now.toISOString(),
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    last_review: null,
    state: "new",
    learning_step: 0,
  };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MS_PER_MIN = 1000 * 60;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function clampDifficulty(d: number): number {
  return clamp(d, 1, 10);
}

function clampStability(s: number): number {
  return Math.max(0.1, s);
}

// G in 1..4: Again=w0, Hard=w1, Good=w2, Easy=w3
function initStability(g: Rating): number {
  return Math.max(0.1, FSRS_PARAMS.w[g - 1]);
}

function initDifficulty(g: Rating): number {
  return clampDifficulty(FSRS_PARAMS.w[4] - Math.exp(FSRS_PARAMS.w[5] * (g - 1)) + 1);
}

function retrievability(tDays: number, s: number): number {
  return Math.pow(1 + FACTOR * tDays / s, DECAY);
}

function nextIntervalDays(s: number): number {
  const interval = (s / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return Math.round(clamp(interval, 1, MAX_INTERVAL));
}

// Mean-reversion difficulty update.
function nextDifficulty(d: number, g: Rating): number {
  const w7 = FSRS_PARAMS.w[7];
  const w6 = FSRS_PARAMS.w[6];
  return clampDifficulty(w7 * initDifficulty(4) + (1 - w7) * (d + w6 * (g - 3)));
}

function stabilityAfterRecall(d: number, s: number, r: number, g: Rating): number {
  const w8 = FSRS_PARAMS.w[8];
  const w9 = FSRS_PARAMS.w[9];
  const w10 = FSRS_PARAMS.w[10];
  const w15 = FSRS_PARAMS.w[15];
  const w16 = FSRS_PARAMS.w[16];
  const hardPenalty = g === 2 ? w15 : 1;
  const easyBonus = g === 4 ? w16 : 1;
  return (
    s *
    (1 +
      Math.exp(w8) *
        (11 - d) *
        Math.pow(s, -w9) *
        (Math.exp(w10 * (1 - r)) - 1) *
        hardPenalty *
        easyBonus)
  );
}

function stabilityAfterForget(d: number, s: number, r: number): number {
  const w11 = FSRS_PARAMS.w[11];
  const w12 = FSRS_PARAMS.w[12];
  const w13 = FSRS_PARAMS.w[13];
  const w14 = FSRS_PARAMS.w[14];
  return Math.min(
    s,
    w11 * Math.pow(d, -w12) * (Math.pow(s + 1, w13) - 1) * Math.exp(w14 * (1 - r))
  );
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function addMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * MS_PER_MIN).toISOString();
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * MS_PER_DAY).toISOString();
}

export function schedule(state: CardState, rating: Rating, now: Date = new Date()): CardState {
  const currentState: string = state.state || (state.reps > 0 ? "review" : "new");

  // Real days elapsed since the last review (not an accumulating counter).
  const elapsedDays = state.last_review
    ? Math.max(0, (now.getTime() - new Date(state.last_review).getTime()) / MS_PER_DAY)
    : 0;

  const nowIso = now.toISOString();

  // Carry-forward base for the result.
  const base: CardState = {
    stability: state.stability,
    difficulty: state.difficulty,
    due: state.due,
    elapsed_days: elapsedDays,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    last_review: nowIso,
    state: currentState,
    learning_step: state.learning_step || 0,
  };

  const finalizeReview = (next: CardState): CardState => {
    next.stability = round2(clampStability(next.stability));
    next.difficulty = clampDifficulty(next.difficulty);
    return next;
  };

  // ---- NEW / LEARNING ----
  if (currentState === "new" || currentState === "learning") {
    const isFirstTouch = currentState === "new";
    // Initialize S/D on the first touch from the ACTUAL first rating (FSRS S0/D0).
    // Hardcoding rating 1 here gave every card the "Again" stability (0.4d),
    // so even cards answered "Good" graduated with 1-day intervals.
    let s = isFirstTouch ? initStability(rating) : state.stability;
    let d = isFirstTouch ? initDifficulty(rating) : state.difficulty;

    if (rating === 1) {
      // Again -> stay/enter learning at step 0.
      return finalizeReview({
        ...base,
        stability: s,
        difficulty: d,
        state: "learning",
        learning_step: 0,
        scheduled_days: 0,
        due: addMinutes(now, LEARNING_STEPS_MIN[0]),
      });
    }

    if (rating === 2) {
      // Hard -> stay on current step.
      const step = base.learning_step;
      const stepMin = LEARNING_STEPS_MIN[Math.min(step, LEARNING_STEPS_MIN.length - 1)];
      return finalizeReview({
        ...base,
        stability: s,
        difficulty: d,
        state: "learning",
        learning_step: step,
        scheduled_days: 0,
        due: addMinutes(now, stepMin),
      });
    }

    if (rating === 4) {
      // Easy -> graduate immediately.
      const gradS = initStability(4);
      const gradD = initDifficulty(4);
      const days = nextIntervalDays(gradS);
      return finalizeReview({
        ...base,
        stability: gradS,
        difficulty: gradD,
        state: "review",
        learning_step: 0,
        reps: base.reps + 1,
        scheduled_days: days,
        due: addDays(now, days),
      });
    }

    // Good (rating === 3) -> advance step, maybe graduate.
    const nextStep = base.learning_step + 1;
    if (nextStep >= LEARNING_STEPS_MIN.length) {
      // Graduate to review, carrying the S/D accumulated during learning.
      const gradS = isFirstTouch ? initStability(3) : s;
      const gradD = isFirstTouch ? initDifficulty(3) : d;
      const days = nextIntervalDays(gradS);
      return finalizeReview({
        ...base,
        stability: gradS,
        difficulty: gradD,
        state: "review",
        learning_step: 0,
        reps: base.reps + 1,
        scheduled_days: days,
        due: addDays(now, days),
      });
    }

    // Still in learning: schedule next step.
    return finalizeReview({
      ...base,
      stability: s,
      difficulty: d,
      state: "learning",
      learning_step: nextStep,
      scheduled_days: 0,
      due: addMinutes(now, LEARNING_STEPS_MIN[nextStep]),
    });
  }

  // ---- RELEARNING ----
  if (currentState === "relearning") {
    if (rating === 1) {
      // Stay at step 0.
      return finalizeReview({
        ...base,
        state: "relearning",
        learning_step: 0,
        scheduled_days: 0,
        due: addMinutes(now, RELEARNING_STEPS_MIN[0]),
      });
    }

    if (rating === 2) {
      // Hard -> stay on current relearning step.
      const step = base.learning_step;
      const stepMin = RELEARNING_STEPS_MIN[Math.min(step, RELEARNING_STEPS_MIN.length - 1)];
      return finalizeReview({
        ...base,
        state: "relearning",
        learning_step: step,
        scheduled_days: 0,
        due: addMinutes(now, stepMin),
      });
    }

    // Good / Easy -> graduate back to review using the post-lapse stability.
    const days = nextIntervalDays(state.stability);
    return finalizeReview({
      ...base,
      state: "review",
      learning_step: 0,
      reps: base.reps + 1,
      scheduled_days: days,
      due: addDays(now, days),
    });
  }

  // ---- REVIEW ----
  if (rating === 1) {
    // Lapse -> relearning.
    const r = retrievability(elapsedDays, state.stability);
    const newS = stabilityAfterForget(state.difficulty, state.stability, r);
    const newD = nextDifficulty(state.difficulty, 1);
    return finalizeReview({
      ...base,
      stability: newS,
      difficulty: newD,
      state: "relearning",
      learning_step: 0,
      lapses: base.lapses + 1,
      scheduled_days: 0,
      due: addMinutes(now, RELEARNING_STEPS_MIN[0]),
    });
  }

  // Hard / Good / Easy -> stay in review.
  const r = retrievability(elapsedDays, state.stability);
  const newS = stabilityAfterRecall(state.difficulty, state.stability, r, rating);
  const newD = nextDifficulty(state.difficulty, rating);
  const days = nextIntervalDays(clampStability(newS));
  return finalizeReview({
    ...base,
    stability: newS,
    difficulty: newD,
    state: "review",
    learning_step: 0,
    reps: base.reps + 1,
    scheduled_days: days,
    due: addDays(now, days),
  });
}

/**
 * Current recall probability (retrievability) of a card, per the FSRS
 * forgetting curve. Null while the card has no review history.
 */
export function retrievabilityAt(
  stability: number,
  lastReview: string | null,
  now: Date = new Date()
): number | null {
  if (!lastReview || stability <= 0) return null;
  const t = Math.max(0, (now.getTime() - new Date(lastReview).getTime()) / MS_PER_DAY);
  return retrievability(t, stability);
}

export function getNextReviewInterval(state: CardState): number {
  if (state.reps === 0) return 0;
  const now = new Date();
  const due = new Date(state.due);
  return Math.max(0, Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY));
}
