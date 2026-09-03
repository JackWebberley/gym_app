/// What a meal is supposed to land on.
///
/// The spec fits recipes to a particular day's remaining macros. This build
/// cannot: a portion sits in a pool and gets eaten whenever, so it has to be
/// right for *any* day. Recipes are therefore fitted to a per-meal-type envelope
/// derived from the daily targets, and the day-level precision comes later, at
/// log time, by re-scaling against what is actually left (see scaleForTarget).

import type { Envelope, EnvelopeTable, Eater, MealType } from "./types";
import { MEAL_TYPES } from "./types";

export type HouseholdSettings = {
  baselineCalories: number;
  proteinTargetG: number;
  partnerCalories: number;
  partnerProteinG: number;
  splitBreakfast: number;
  splitLunch: number;
  splitDinner: number;
  splitSnack: number;
};

/// How wide an envelope is around its target. A meal within ±20% of its share is
/// close enough — the week's average is what determines results, and the daily
/// number is noise (spec §5.4).
const TOLERANCE = 0.2;

/// Protein is a floor rather than a band: a meal may exceed its share freely.
///
/// Near-full share, not a generous discount. At 0.85 a breakfast carrying 28g
/// against a 32g share cleared the floor and scored the same as one carrying 45g,
/// so the optimiser took whichever was cheaper and the week drifted low. Tightened
/// to 0.95 it costs about £0.80 a week and lifts the planned days by roughly 10g
/// of protein a day, which is the trade the whole library exists to make.
const PROTEIN_FLOOR = 0.95;

export function splitFor(settings: HouseholdSettings, mealType: MealType): number {
  switch (mealType) {
    case "breakfast":
      return settings.splitBreakfast;
    case "lunch":
      return settings.splitLunch;
    case "dinner":
      return settings.splitDinner;
    case "snack":
      return settings.splitSnack;
  }
}

function dailyFor(settings: HouseholdSettings, eater: Eater) {
  return eater === "me"
    ? { calories: settings.baselineCalories, proteinG: settings.proteinTargetG }
    : { calories: settings.partnerCalories, proteinG: settings.partnerProteinG };
}

export function envelopeFor(
  settings: HouseholdSettings,
  eater: Eater,
  mealType: MealType,
): Envelope {
  const daily = dailyFor(settings, eater);
  const split = splitFor(settings, mealType);
  const targetKcal = daily.calories * split;

  return {
    mealType,
    eater,
    targetKcal,
    minKcal: targetKcal * (1 - TOLERANCE),
    maxKcal: targetKcal * (1 + TOLERANCE),
    minProteinG: daily.proteinG * split * PROTEIN_FLOOR,
  };
}

export function buildEnvelopes(settings: HouseholdSettings): EnvelopeTable {
  const table = {} as EnvelopeTable;
  for (const eater of ["me", "partner"] as Eater[]) {
    table[eater] = {} as Record<MealType, Envelope>;
    for (const mealType of MEAL_TYPES) {
      table[eater][mealType] = envelopeFor(settings, eater, mealType);
    }
  }
  return table;
}

/**
 * The splits are a division of one day, so they have to sum to 1. A drifting set
 * would quietly shrink or inflate every envelope in the app, which is exactly the
 * kind of silent error the spec asks to be guarded (spec §11).
 */
export function splitsAreValid(settings: HouseholdSettings): boolean {
  const sum =
    settings.splitBreakfast + settings.splitLunch + settings.splitDinner + settings.splitSnack;
  return Math.abs(sum - 1) < 0.005;
}

/** Normalises a drifting set of splits back onto 1 without changing their ratios. */
export function normaliseSplits<T extends HouseholdSettings>(settings: T): T {
  const sum =
    settings.splitBreakfast + settings.splitLunch + settings.splitDinner + settings.splitSnack;
  if (sum <= 0) return settings;
  return {
    ...settings,
    splitBreakfast: settings.splitBreakfast / sum,
    splitLunch: settings.splitLunch / sum,
    splitDinner: settings.splitDinner / sum,
    splitSnack: settings.splitSnack / sum,
  };
}
