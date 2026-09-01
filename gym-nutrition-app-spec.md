# Gym + Nutrition Tracker — Build Spec

A personal (single-user) training and nutrition tracker. Chat-based food logging with LLM macro estimation, structured workout logging, and a feedback loop that adjusts calorie targets based on actual weight trend.

---

## 1. Principles

Three rules that should decide every design argument later:

1. **Logging must be faster than not logging.** If adding a meal takes more than ~10 seconds, the app fails. Everything else is secondary to this.
2. **The app is a measuring instrument, not a coach.** It surfaces trends and lets you decide. No motivational notifications, no streaks, no badges.
3. **Estimates get corrected once, then remembered.** The same meal should never be re-estimated by an LLM twice. See §5.3.

---

## 2. Stack

Chosen to be boring and fast to build solo on Windows with Claude Code.

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One repo for UI and API routes |
| Styling | Tailwind + shadcn/ui | Fast, decent defaults, mobile-first |
| DB | SQLite via Prisma (dev) → Postgres if hosted | Single user; SQLite is genuinely enough |
| Hosting | Vercel + Neon, or a Pi/NAS at home | Either is fine at this scale |
| LLM | Anthropic API, Claude Sonnet | Macro estimation + parsing |
| Secrets | Doppler | Already in your workflow |
| Auth | Single hardcoded user + a passphrase | Do not build real auth for one user |

**Mobile:** build as a PWA with a web app manifest and offline-capable service worker. You'll log from your phone at the gym and in the kitchen. A native app is not worth it.

**Offline matters more than you'd think** — gym basements have no signal. Workout logging must write to IndexedDB and sync when connectivity returns. Nutrition chat can require a connection (it needs the API anyway).

---

## 3. Data Model

```prisma
model Exercise {
  id            String   @id @default(cuid())
  name          String   @unique
  muscleGroup   String   // chest, back, quads, hamstrings, delts, biceps, triceps, calves, core
  equipment     String   // barbell, dumbbell, cable, machine, bodyweight
  isUnilateral  Boolean  @default(false)
  notes         String?  // "seat position 4, handle high"
  sets          SetLog[]
}

model WorkoutTemplate {
  id        String                  @id @default(cuid())
  name      String                  // "Push", "Pull", "Legs + Arms"
  order     Int                     // rotation position
  items     WorkoutTemplateItem[]
  sessions  Session[]
}

model WorkoutTemplateItem {
  id           String   @id @default(cuid())
  templateId   String
  exerciseId   String
  order        Int
  targetSets   Int
  targetRepMin Int
  targetRepMax Int
}

model Session {
  id          String    @id @default(cuid())
  templateId  String?   // null = freestyle session
  startedAt   DateTime
  endedAt     DateTime?
  bodyweight  Float?
  notes       String?
  sets        SetLog[]
}

model SetLog {
  id          String   @id @default(cuid())
  sessionId   String
  exerciseId  String
  setNumber   Int
  weightKg    Float
  reps        Int
  rpe         Float?   // optional, 6-10
  isWarmup    Boolean  @default(false)
  isFailure   Boolean  @default(false)
}

model DayLog {
  id            String     @id @default(cuid())
  date          DateTime   @unique @db.Date
  dayType       String     // "base" | "golf" | "custom"
  calorieTarget Int        // snapshotted at creation, not derived
  proteinTarget Int
  weightKg      Float?
  steps         Int?
  entries       FoodEntry[]
}

model FoodEntry {
  id          String   @id @default(cuid())
  dayLogId    String
  description String   // "2 weetabix with protein shake"
  calories    Int
  proteinG    Float
  carbsG      Float
  fatG        Float
  source      String   // "llm" | "saved" | "manual" | "corrected"
  confidence  String?  // "high" | "medium" | "low"
  assumptions String?  // what the LLM assumed about portion size
  savedFoodId String?  // if resolved from personal library
  loggedAt    DateTime @default(now())
}

model SavedFood {
  id           String   @id @default(cuid())
  name         String   // canonical: "protein shake (1 scoop, 300ml semi-skimmed)"
  aliases      String   // JSON array of phrasings that resolve here
  calories     Int
  proteinG     Float
  carbsG       Float
  fatG         Float
  timesLogged  Int      @default(0)
  lastLoggedAt DateTime?
}

model Settings {
  id                  String @id @default("singleton")
  baseCalories        Int    // 2400
  golfDayCalories     Int    // 2800
  proteinTargetG      Int    // 160
  weeklyLossTargetKg  Float  // 0.45
  heightCm            Int
}
```

**Note on `calorieTarget` in `DayLog`:** snapshot the target onto the day rather than computing it from `Settings` at read time. When you change your base calories in three weeks, your history must not silently rewrite itself.

---

## 4. Workout Module

### 4.1 Starting a session
Home screen shows **"Next: Pull"** based on rotation position of the last completed session. One tap starts it. Rotation is a cycle, not a weekday schedule — if you skip Wednesday, Pull is still next on Thursday.

### 4.2 The logging screen
This is the screen you'll spend most time in, so it deserves the most care.

For each exercise, show a compact row per set:

```
Lat Pulldown              last: 61kg × 9,9,8
┌──────────────────────────────────────┐
│ 1  [ 61 ] kg  [ 10 ] reps      ✓     │
│ 2  [ 61 ] kg  [  9 ] reps      ✓     │
│ 3  [ 61 ] kg  [    ] reps            │
└──────────────────────────────────────┘
                              + add set
```

Requirements:
- **Prefill from last time.** Weight and reps default to the previous session's values for that set number. Most sets are logged with zero typing.
- **Big tap targets, numeric keypad, no dropdowns.** You have chalky hands and a 60-second rest window.
- **Stepper buttons** (±2.5kg, ±1 rep) beside each field. Faster than the keyboard.
- **Rest timer** auto-starts when a set is ticked. Configurable per exercise, default 120s. Shows in a persistent bar. Must survive screen lock — compute remaining time from a stored timestamp, not a JS interval.
- **Exercise notes visible inline** — "seat 4, handle wide" saves you re-solving machine setup every week.

### 4.3 Progression cues
Above each exercise, show last session's top set and a one-line prompt derived from simple rules:

- Hit or exceeded the top of the target rep range on all sets last time → **"Add 2.5kg"**
- Below the bottom of the range on the last set → **"Hold weight, add a rep"**
- No increase in load or reps for 3 consecutive sessions → **"Stalled — try a different variation or drop 10% and build back"**

Keep this rule-based. Don't put an LLM in the middle of it; the rules are trivial and you want them instant and deterministic.

### 4.4 Exercise history
Per exercise: a chart of estimated 1RM over time (Epley: `weight × (1 + reps/30)`), and a table of every session. Estimated 1RM is the cleanest single progress signal when your rep ranges vary — it lets 60kg×12 and 70kg×8 be compared honestly.

Also track **total weekly volume per muscle group** (sets, not tonnage). Useful for spotting that your chest is getting 12 sets a week and your hamstrings 3.

---

## 5. Nutrition Module

### 5.1 The chat interface
A single text box. You type naturally:

> "two weetabix with a protein shake and a banana"

The app responds with a parsed breakdown, each item editable inline, and a confirm button:

```
Weetabix × 2                    134 kcal   4.4p  27c   1f
Protein shake (1 scoop, 300ml   240 kcal  32.0p  14c   6f
  semi-skimmed)
Banana (medium, ~118g)          105 kcal   1.3p  27c   0f
─────────────────────────────────────────────────────────
Total                           479 kcal  37.7p  68c   7f

Assumed: medium banana, semi-skimmed milk, one 30g scoop.
                                        [Edit]  [Log it]
```

Always show assumptions. Portion size is where nearly all the error lives, and surfacing the assumption is what lets you catch a 200-calorie mistake in one glance.

### 5.2 The estimation call
Force structured output. System prompt shape:

```
You estimate nutritional macros from natural language food descriptions.
Return ONLY valid JSON, no prose, no markdown fences.

Schema:
{
  "items": [
    {
      "name": "canonical name including portion",
      "quantity": "as described or assumed",
      "calories": int,
      "protein_g": float,
      "carbs_g": float,
      "fat_g": float,
      "assumption": "what you assumed if unstated, else null",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "clarification_needed": "single question, or null"
}

Rules:
- UK products and portion conventions unless stated otherwise.
- If a portion is unstated, assume a typical serving and record it in "assumption".
- Only set clarification_needed when the ambiguity is worth more than
  ~150 kcal (e.g. "a curry", "some chicken"). Otherwise assume and move on.
- Round calories to the nearest 5.
```

Pass the user's `SavedFood` library (name + macros) in the prompt so recurring items resolve to your own corrected values rather than being re-guessed. Cap it at the ~40 most-logged entries to keep the prompt small.

**Handle `clarification_needed` as a single follow-up question, never a conversation.** One clarification maximum, then estimate regardless. A back-and-forth about the fat content of a curry defeats the point of the feature.

### 5.3 Personal food library — the feature that makes this worth building
Every commercial tracker makes you search a database of a million foods to find the one yoghurt you actually eat. Invert it.

- Any confirmed entry can be saved to `SavedFood` with one tap.
- When you **correct** an LLM estimate, the corrected version is saved automatically — your correction is the strongest possible signal about what you actually eat.
- On the next log, matching descriptions resolve from the library **deterministically, with no API call**. Instant, free, and exactly right.
- Home screen shows your top 6 most-logged foods as one-tap buttons.

After two weeks, most of your logging is one tap and the LLM only handles genuinely novel meals. This is what makes the app sustainable past the initial enthusiasm.

### 5.4 The daily view
Protein first, calories second — protein is the harder target to hit and the one that matters most while cutting.

```
Monday 31 Aug                            Base day  ⟳
─────────────────────────────────────────────────────
Protein    ████████████░░░░░░   118 / 160g    42g left
Calories   ██████████████░░░░  1,840 / 2,400  560 left
Carbs 210g    Fat 62g
```

The `⟳` toggles base ↔ golf day, which swaps the target. When toggled, the day's `calorieTarget` is rewritten and the remaining figure updates.

Show a **rolling 7-day average intake** under the daily numbers. The weekly average is what determines your results; the daily number is noise. Making the average visible is what stops one heavy Saturday from feeling like a failure.

---

## 6. The Feedback Loop

The feature that separates this from a logging app. Weekly, on a Sunday, generate a review:

```
Week of 25–31 Aug
─────────────────────────────────────────────────────
Weight       84.1kg  (7-day avg, down 0.4kg on last week)
Intake       2,610 kcal/day average
Protein      152g/day average — hit target 5 of 7 days
Training     3 sessions, 14 of 16 planned sets progressed

Estimated maintenance: 3,020 kcal/day
  (derived from intake and weight change, not a formula)

→ On target. No changes suggested.
```

**Estimating maintenance from your own data** — this is the real payoff. After 3+ weeks you have (average intake) and (average weekly weight change). Since roughly 7,700 kcal ≈ 1kg of body mass:

```
maintenance ≈ avg_daily_intake + (weekly_kg_change × 7700 / 7)
```

This replaces every BMR formula and every Garmin estimate with a number measured from you. It gets more accurate each week. Use a 3-week rolling window and don't show it before you have 21 days of data — the noise before then makes it worse than useless.

Then: if measured loss is more than 0.2kg/week off target for two consecutive weeks, suggest a ±150 kcal adjustment to base calories. **Suggest, don't auto-apply.**

### Weight entry
Log daily on waking. Display the 7-day rolling average everywhere; never the raw daily figure on its own, except on the entry screen itself. Chart both — the raw as faint dots, the average as the line. Seeing the scatter around a steadily falling line is the single most reassuring thing a cutting tracker can show you.

---

## 7. Golf Integration

You play often enough that this is worth a small amount of specific handling — and specific beats generic here.

- Golf day toggle switches the target (§5.4). That alone covers 90% of the value.
- Optionally record round-level data: course, holes, walked or cart, watch-reported calories.
- Track **watch-reported vs. your assumed 800 kcal** over time. As the app learns your true maintenance from §6, you'll be able to see how far off the Garmin actually runs and adjust the 800 with evidence instead of guessing.

Skip Garmin API integration in v1. It's an OAuth dance plus a rate-limited API for a number you've already decided not to trust.

---

## 8. Meal Planning & Ingredient Economy

The hardest feature in the app, and the one with the most value. The goal is not "suggest meals" — it's **plan a week where everything you buy gets used.**

### 8.1 The core insight

Recipes consume ingredients in *cooking quantities* (one potato, 40g feta, half a lemon). Shops sell ingredients in *pack sizes* (2.5kg bag, 200g block, three lemons). Meal planning that ignores this gap generates a £90 shop for £45 of food.

So the planner optimises over two things at once:

1. **Nutrition fit** — does the week hit your calorie and protein targets?
2. **Ingredient economy** — does the week consume whole packs of things, and use up what's already in the fridge?

Constraint 2 is what nobody builds, and it's a solver problem, not an LLM problem. **Do not ask the model to do this arithmetic.** The LLM's job is generating and describing recipes. The optimisation is deterministic code.

### 8.2 Additional data model

```prisma
model Ingredient {
  id            String   @id @default(cuid())
  name          String   @unique      // "chicken breast"
  aisle         String                // produce, meat, dairy, dry, frozen, tinned
  isStaple      Boolean  @default(false)  // oil, salt, spices — assumed present
  shelfLifeDays Int                   // 3 for fresh fish, 30 for potatoes, 365 for tinned
  freezable     Boolean  @default(false)
  unitGrams     Float?                // 1 medium potato = 180g; null if sold by weight only
  packs         PackSize[]
  per100g       Json                  // { kcal, protein, carbs, fat }
}

model PackSize {
  id            String  @id @default(cuid())
  ingredientId  String
  label         String  // "2.5kg bag", "300g pack", "single"
  grams         Float
  priceGbp      Float?
  isDivisible   Boolean @default(false)  // loose potatoes: buy exactly what you need
}

model Recipe {
  id            String             @id @default(cuid())
  name          String
  mealType      String             // breakfast | lunch | dinner
  servings      Int                @default(1)
  prepMinutes   Int
  method        String             // markdown
  isFavourite   Boolean            @default(false)
  timesCooked   Int                @default(0)
  batchFriendly Boolean            @default(false)
  items         RecipeIngredient[]
}

model RecipeIngredient {
  id           String  @id @default(cuid())
  recipeId     String
  ingredientId String
  grams        Float
  isScalable   Boolean @default(false)  // see §8.5
  minGrams     Float?
  maxGrams     Float?
}

model PantryItem {
  id           String   @id @default(cuid())
  ingredientId String
  grams        Float
  expiresOn    DateTime
  source       String   // "leftover" | "manual"
}

model MealPlan {
  id        String     @id @default(cuid())
  weekStart DateTime   @db.Date
  slots     PlanSlot[]
  status    String     // "draft" | "confirmed" | "shopped"
}

model PlanSlot {
  id         String   @id @default(cuid())
  mealPlanId String
  date       DateTime @db.Date
  mealType   String
  recipeId   String
  scaleFactor Float   @default(1.0)   // macro tuning, see §8.5
  isLocked   Boolean  @default(false) // user pinned it; optimiser can't move it
  isCooked   Boolean  @default(false)
}
```

**`PantryItem` is the feature that compounds.** Buy a 200g block of feta, use 120g, and 80g goes into the pantry with an expiry date. Next week's optimiser sees free feta expiring in five days and weights recipes using it. This is what makes week three cheaper than week one.

### 8.3 Planning flow

The user specifies:
- How many breakfasts, lunches, dinners to plan (e.g. 7 / 5 / 6 — you eat out Saturday and skip two work lunches)
- **Variety level**: how many *distinct* recipes across those slots
- Optional constraints: max prep time on weeknights, anything to avoid this week

Then:

1. **Candidate generation.** Pull from the recipe library first. If the library is thin or variety demands it, ask the LLM to generate new recipes — biased toward ingredients already in the pantry and toward ingredients that appear in existing candidates.
2. **Optimisation.** Score combinations (§8.4) and produce the best plan.
3. **Review.** Show the plan with a live waste and cost readout. Every slot has swap, lock, and reroll.
4. **Confirm** → generate shopping list → mark as shopped → pantry updates.

**Locking is essential.** You'll want Wednesday's dinner fixed and everything else re-optimised around it. The optimiser must treat locked slots as constraints, not suggestions.

### 8.4 The optimiser

Small enough problem to solve without a real solver library. ~20–40 candidate recipes over ~18 slots: greedy construction plus hill-climbing with random restarts converges in well under a second.

```
score(plan) =
    w1 × macroDeviation(plan)        // sum of |daily kcal - target| and protein shortfall
  + w2 × wasteCost(plan)             // £ value of purchased-but-unused
  + w3 × totalCost(plan)             // £ of the shop
  + w4 × repetitionPenalty(plan)     // same recipe twice in a row
  - w5 × pantryUsed(plan)            // reward consuming existing stock
  - w6 × favouriteBonus(plan)        // reward recipes you actually like
```

`wasteCost` is where the potato problem is solved:

```
for each ingredient in plan:
    needed  = total grams across all slots
    fromPantry = min(needed, pantryGrams)
    toBuy   = needed - fromPantry
    if isStaple: continue
    pack    = cheapest pack combination covering toBuy
    surplus = pack.grams - toBuy

    if surplus <= 0:                 waste = 0
    elif ingredient.freezable:       waste = surplus × price/g × 0.15
    elif surplus survives to next week within shelfLifeDays:
                                     waste = surplus × price/g × 0.3
    else:                            waste = surplus × price/g × 1.0
```

The shelf-life weighting is the important nuance. A 2.5kg bag of potatoes is barely penalised — they keep for a month and you'll use them. A 250g pack of fresh basil for one recipe is penalised at nearly full value. **Waste is about perishability, not pack size**, and conflating the two produces bad plans.

The optimiser's natural response to the potato problem is to pull in a second potato-using recipe that week, or to prefer a loose-potato purchase where `isDivisible` is true. Both are correct answers, and it will find them without being told.

### 8.5 Scalable components — how macros actually get hit

Don't try to generate recipes that land exactly on your targets. Instead mark components as scalable:

> Chicken, rice and roasted veg
> — chicken breast **180g** *(scalable 120–250g)*
> — rice **75g dry** *(scalable 50–120g)*
> — mixed veg 200g, olive oil 10g *(fixed)*

The optimiser tunes the scalable amounts to fit the day's remaining macros. One recipe covers 550–900 kcal without changing what you're cooking. This is how a plan hits 2,400 on Tuesday and 2,800 on a golf Saturday using the same dishes.

It also matches how you actually cook. Nobody weighs 7g of olive oil, but everybody adjusts their rice portion.

### 8.6 Batch cooking

Set `batchFriendly` on recipes and let a single cook fill multiple slots. Cooking one lunch five times is the single most effective waste reducer available — it consumes whole packs by construction.

Model it as one `PlanSlot` per meal, all referencing the same recipe on the same cook date. The shopping list multiplies quantities; the plan view groups them as "Sunday: batch cook 5× chicken traybake".

Worth surfacing the trade-off directly in the variety control: *"3 distinct lunches instead of 5 saves an estimated £11 and 400g of waste this week."* Let the number make the argument.

### 8.7 Shopping list

Grouped by aisle, in pack units, with the leftover made explicit:

```
PRODUCE
  ☐ Potatoes — loose, 6 (~1.1kg)
  ☐ Broccoli — 2 heads
  ☐ Lemons — pack of 3          ⚠ 1 spare, expires ~7 Sep

MEAT & FISH
  ☐ Chicken breast — 2 × 650g pack
  ☐ Salmon fillets — 4 pack

DAIRY
  ☐ Greek yogurt — 1kg tub
  ☐ Feta — 200g                 ⚠ 80g spare → pantry

ALREADY HAVE (from pantry)
  ✓ Rice 400g · Feta 80g · Frozen peas 300g

─────────────────────────────────────────────
Estimated £58.40 · projected waste £2.10 (3.6%)
```

The projected-waste line at the bottom is the whole feature in one number. Watch it fall as the pantry fills up over the first month.

Ticking items off marks the plan `shopped` and writes surplus quantities into `PantryItem` with computed expiry dates.

### 8.8 Closing the loop with nutrition logging

When a planned meal is cooked, one tap logs it — macros come from the recipe, no LLM call, no estimation error. Planned meals are the most accurately logged meals you'll have.

If you deviate ("had a takeaway instead"), mark the slot skipped. Its ingredients return to the pantry with adjusted expiries, and next week's optimiser picks them up.

### 8.9 Seeding the pack-size library

The `Ingredient` and `PackSize` tables are the bottleneck — the optimiser is only as good as its pack data, and no free UK grocery API exists worth building on.

Pragmatic approach: seed ~120 ingredients you actually eat with typical UK supermarket pack sizes and rough prices, generated by the LLM in one batch and corrected by you. Then let it grow — any new ingredient prompts a one-time "what pack sizes does this come in?" during the first shop. Prices drift, but relative pack economics stay stable, which is all the optimiser needs.

---

## 9. Build Order

Ship each phase before starting the next. Each is usable on its own.

**Phase 1 — Workout logging (week 1)**
Exercise library, three templates, session logging with prefill, rest timer, history. Use it for a full week before writing any nutrition code. You'll discover the logging screen's real problems only by using it between sets.

**Phase 2 — Nutrition core (week 2)**
Chat entry, LLM estimation, confirm/edit, daily totals, targets, day-type toggle.

**Phase 3 — Memory and speed (week 3)**
SavedFood library, correction capture, quick-add buttons, 7-day average intake.

**Phase 4 — The loop (week 4)**
Weight logging, rolling average, weekly review, maintenance estimation, adjustment suggestions.

**Phase 5 — Polish**
PWA install, offline workout logging, charts, exercise 1RM history, volume-per-muscle-group.

**Phase 6 — Recipes and pantry (weeks 5–6)**
Recipe library, ingredient and pack-size tables, seed data, pantry tracking, one-tap logging of cooked recipes. No optimiser yet — manually assign recipes to slots and generate a shopping list. This alone is useful, and it builds the ingredient data the optimiser needs.

**Phase 7 — The optimiser (week 7+)**
Scoring function, greedy plus hill-climbing search, scalable components, lock and reroll, waste projection. Build this last and build it against real data. An optimiser tested on ten seeded recipes will make choices that look fine and cook badly.

---

## 10. Explicitly Out of Scope

Worth writing down so you don't drift into them at 11pm:

| Not building | Why |
|---|---|
| Barcode scanning | Needs a licensed food database. The saved-food library solves the same problem better for one user. |
| Social / sharing | You are the only user. |
| Streaks, badges, gamification | Actively counterproductive. A missed day is data, not a failure. |
| Generic AI meal planning | Superseded by §8, which is the version worth building. Plans that ignore pack sizes go unused. |
| Native iOS/Android app | A PWA does everything you need here. |
| Multi-user, real auth, roles | One user. A passphrase is enough. |
| Recipe builder | Save the finished meal to SavedFood instead. Same outcome, 5% of the work. |
| Garmin/Apple Health sync | Deferred to v2 at the earliest. |

---

## 11. Notes for Claude Code

- Write the Prisma schema first and run the migration before any UI. The schema above is close to final; changing it later is the main source of pain.
- Put the LLM call behind a single `estimateMacros(description, savedFoods)` function in `lib/nutrition.ts`. It should be the only place in the codebase that touches the Anthropic API.
- Write real tests for the progression rules (§4.3) and the maintenance calculation (§6). They're pure functions with clear inputs and outputs, and they're where a silent bug would quietly mislead you for months.
- Store all weights in kg and all energy in kcal internally. No unit conversion anywhere except display.
- Dates: store `DayLog.date` as a date, not a timestamp. A 23:40 snack belongs to that day, not the next one in UTC.
