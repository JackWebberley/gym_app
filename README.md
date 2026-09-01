# Gym + Nutrition Tracker

Personal single-user training and nutrition tracker. Built against
[`gym-nutrition-app-spec.md`](./gym-nutrition-app-spec.md).

**Phases 1, 2, 6 and 7 are built** — workout logging; nutrition tracking with chat
estimation and the personal food library; and meal planning with the ingredient
economy optimiser. The feedback loop (§6) is the remaining major phase.

## Running it

```bash
npm install          # runs prisma generate afterwards
cp .env.example .env # then paste your two Supabase connection strings
npm run db:check     # proves both connections work before anything else
npm run db:deploy    # applies migrations over the direct connection
npm run db:seed      # 81 exercises + a Push/Pull/Legs starter cycle
npm run db:seed:meals # 206 UK ingredients with pack sizes + 118 recipes
npm run dev
```

## Database

Postgres, hosted on Supabase. Two connection strings, and the difference matters:

| Variable | Supabase name | Port | Used by |
|---|---|---|---|
| `DATABASE_URL` | Transaction pooler | 6543 | the running app |
| `DIRECT_URL` | Session pooler | 5432 | migrations and seeding |

The app goes through the pooler because serverless invocations open and drop
connections constantly. Migrations must **not**: the transaction pooler cannot
hold the session-level locks DDL needs. `npm run db:check` catches it if the two
get swapped.

Both strings need `uselibpqcompat=true&sslmode=require`. Recent `pg` versions read a
bare `sslmode=require` as `verify-full`, which cannot validate the certificate
Supabase signs its pooler with; `uselibpqcompat` restores libpq meaning — encrypt
the connection, do not verify the server certificate.

`DayLog.date` is a `text` column holding `YYYY-MM-DD` rather than a Postgres
`date`. It sorts and range-queries identically, and it cannot drift a 23:40 snack
into the next day the way a timestamp can (spec §11).

### Row level security

Supabase exposes the `public` schema over PostgREST, so by default every table
is readable and writable by anyone holding the project publishable key. This app
never uses that path — it talks to Postgres server-side through Prisma as the
table owner — so `20260901130000_lock_down_public_schema` enables RLS on every
table with **no policies**, and revokes the `anon`/`authenticated` grants.

RLS is ENABLEd, not FORCEd: the table owner bypasses RLS, which is what keeps
Prisma working. FORCE would lock the app out of its own database.

Supabase's linter will report `rls_enabled_no_policy` at INFO level for each
table. That is the intended end state here, not a gap to close. If you ever add
Supabase Auth or the JS client, that is the moment to write real policies.

`ANTHROPIC_API_KEY` is needed only for chat macro estimation — manual entry and
the saved-food library work without it. `.env` is gitignored; `.env.example` is
the template.

```bash
npm test             # progression rules, rotation, prefill
```

## How the workout module works

**Exercises** — 81 seeded hypertrophy movements across 11 muscle groups, no
cardio. Each carries a muscle group, equipment type, a rest-timer default, and
optional setup notes ("seat 4, handle wide") that show inline while you log.
Add your own from the Exercises screen; re-seeding never overwrites notes or
rest overrides you have changed by hand.

**Exercise groups** — a named, ordered list of exercises with per-exercise target
sets and a rep range. Create one from scratch on the Groups screen: name it, then
pick its exercises from the library and set sets/rep ranges.

**Cycles** — an ordered rotation of exercise groups. One cycle is active at a
time. Reorder groups with the arrows on the Cycles screen (saved immediately),
or add and remove groups in the cycle editor. It is a cycle, not a weekday schedule: the rotation advances one slot each
time you *finish* a session, so skipping Wednesday does not shift what comes
next. A group may appear more than once in a rotation.

**Training** — the home screen shows the next group in the rotation and starts it
in one tap. You can start any other group, or a freestyle session, without moving
the rotation.

**Logging** — every set prefills from the same set number last time you did that
exercise, so a normal set costs zero typing. Amend the number and tick it.
Alongside each exercise: last session's performance, a rule-based progression
cue, and the exercise's setup notes. Ticking a set starts the rest timer, which
survives a screen lock because only the end timestamp is stored, never a
countdown.

Prefill looks at the exercise, not the day — so the same movement carries its
numbers across whichever day you use it in.

## How the nutrition module works

**Goals** — base calories, a separate golf-day calorie figure, and a protein
target. Saving them changes what *future* days aim at; days already logged keep
the targets they were logged against.

**The day** — protein first, calories second, each with what is left. Carbs and
fat are recorded on every entry and shown as running totals, but are not targeted
yet. One button flips the day between base and golf, rewriting that day's calorie
target and nothing else.

**Chat entry** — type what you ate in plain English. Anything already in your
library resolves instantly with no API call; only genuinely novel meals reach
Claude. The breakdown comes back itemised and editable, with the portion
assumption spelled out, and nothing is written until you confirm.

**Manual entry** — type the macros yourself, no API call at all.

**The library** — every confirmed item is saved automatically. Re-logging bumps a
counter but never overwrites your numbers; editing a value before logging marks
the entry `corrected` and *does* replace them, because a correction is the
strongest signal about what you actually eat. Your six most-logged foods sit on
the day screen as one-tap buttons.

## Icons

All icons are generated from `Favicon.png` (1254×1254) by `npm run icons`:

| File | Size | Used for |
|---|---|---|
| `app/icon.png` | 48 | browser tab |
| `app/apple-icon.png` | 180 | iOS Add to Home Screen |
| `public/icon-192.png` | 192 | web app manifest |
| `public/icon-512.png` | 512 | web app manifest, splash |

Next emits the link tags for the first two by convention. iOS reads the
**apple-touch-icon**, not the manifest, for the home-screen tile — and
`appleWebApp.capable` in the root layout is what makes it launch standalone
rather than in a Safari tab.

Next does not rewrite `basePath` inside a manifest, so `app/manifest.ts`
prefixes every URL with `/gym` by hand. Getting that wrong fails silently: the
manifest still parses and the icons simply never load.

## Access

The whole app sits behind a passcode (spec §10 — one user, a passphrase is
enough). `middleware.ts` gates every route, so an unauthenticated request never
reaches the database. The passcode is **not in the repo**: it comes from
`APP_PASSCODE`, with `AUTH_SECRET` signing the session cookie.

The cookie is HttpOnly, scoped to `/gym`, and its signature covers the expiry so
it cannot be extended by hand. Sessions last 90 days.

## How the meal planner works

**It plans a menu, not a week.** The spec pins every planned meal to a date
(§8.2). This does not, because cooking here is shared between two people and
genuinely irregular, and a dated plan is wrong by Tuesday — at which point you
stop opening it and the £40 shop rots. A menu is a set of **cooks**, each
producing **servings** that sit in a pool until somebody eats them. The shop is
the commitment; the calendar is not.

Eating out therefore needs no feature at all. You log the restaurant meal with the
chat estimator, the pool simply does not drain, and the servings keep. That is the
test of the design being right: the awkward case required zero special handling.

**Recipes are fitted to envelopes, not to days.** A serving that could be eaten on
any day cannot be tuned to Tuesday's remainder, so each recipe is fitted to the
share a meal type earns of a daily target — a dinner lands near 672 kcal for me,
476 for her. Day-level precision comes back at log time: tap a serving on the Food
screen and the scalable components are re-tuned against what is actually left
(§8.5). That matches the spec's own view that the weekly average decides results
and the daily figure is noise (§5.4).

**Two people, one log.** Each cook makes a portion for each of you with its own
scale factor, so one dish is 180g of chicken for me and 120g for her. The shop is
sized off the *sum* of the factors — 300g, not 360g — while fixed components like
oil still multiply per portion. Her servings drain the pool so the app knows the
food is gone; only mine ever reach a `DayLog`.

**Uncertainty is an input, not a problem.** Instead of a schedule you say how sure
the week is. That becomes a slippage term: the less certain the week, the harder
the optimiser leans on recipes that freeze and keep, so being wrong is cheap by
construction.

### The recipe library

118 recipes: 100 protein-led ones in `seed-recipes.ts` plus the original 18
starters. The 100 follow three rules, each of which is enforced by a test in
`lib/__tests__/meal-recipes.test.ts` rather than trusted:

- **Protein first.** Every dinner clears 44g and every lunch 39g in a single base
  portion, and at least a quarter of each dinner's calories come from protein.
- **Every dinner contains meat**, and most lunches do. Fish, seafood, eggs and
  dairy carry the variety alongside it — including in dinners, via dishes like
  chorizo-and-prawn rice and bacon-wrapped cod, which get seafood onto the plate
  without breaking the rule.
- **Ingredients repeat on purpose.** 100 unrelated dishes would give the optimiser
  no overlap to find, and overlap is the whole mechanism.

That test suite also checks every ingredient name resolves, that base portions sit
near their envelope, and — the one that actually caught something — that each
recipe can shrink far enough to serve the smaller portion as well as the larger.
Fourteen could not, because a single fixed component was holding the floor up.

Two weights had to move once the library was in place, both for the same reason:
a gentle penalty is a price, and the optimiser will happily pay it.

| | was | now | why |
|---|---|---|---|
| Protein shortfall | £0.05/g | £0.30/g | A 21g-protein dinner cost £0.85 to include and won on price |
| Per-meal protein floor | 0.85 × share | 0.95 × share | A 28g breakfast cleared a 32g-share floor and scored like a 45g one |

Together they lifted a planned week from ~112g to ~135g of protein a day for about
£0.80 more on the shop.

### Where new recipes come from

The library first, always. Claude is asked only for what the library genuinely
cannot cover, and it is asked from a basket we chose — the pantry, plus the
ingredients the library candidates already commit us to. Anything it writes is
saved, so the API gets asked less every week, exactly as `SavedFood` does for
estimation (§5.3). **The model never does arithmetic** (§8.1): it returns
ingredient names and grams, and every macro, price, pack and waste figure is
computed here from the `Ingredient` table.

### How it avoids buying a pack of onions for one onion

By costing the **basket**, never the recipe. Ingredient needs are summed across
every selected recipe, the pantry is spent first, and only then are packs chosen:

```
one recipe needing 1 onion    → a pack of 3 → 2 spare → waste charged
plus one needing 2 more       → same pack   → 0 spare → the onions were free
```

The second recipe's marginal cost is near zero, so the search prefers it. Nothing
in the scoring function mentions overlap — it falls out of pricing the shop
instead of the dish. Greedy construction makes this explicit by adding whichever
recipe is cheapest *given what is already in the basket*, then hill-climbing with
random restarts polishes it. Deterministic given a seed, which is what makes
"reroll" meaningful. A realistic week solves in about 80ms.

**Waste is weighted by perishability, not by how much is left over** (§8.4):

| | charged |
|---|---|
| staples (oil, salt, spices) | nothing — never costed or shopped |
| keeps 90+ days — tins, jars, dry goods | 5% — that is inventory, not waste |
| short-lived but freezable — chicken | 15% |
| survives to next week — potatoes | 30% |
| spoils first — fresh herbs | 100% |

The 90-day tier is an addition to the spec's three. Its own data model anticipates
shelf lives of "365 for tinned" (§8.2), and charging a 500g jar of mayonnaise 30%
of its value because one recipe used 30g is simply wrong — the jar gets finished,
and the pantry already tracks it. Without that tier the optimiser quietly avoids
every recipe containing a condiment.

`isDivisible` sidesteps the problem entirely where the shop allows it: loose onions
mean buy exactly 550g.

### The pantry is the part that compounds

Marking a shop done files every leftover into the pantry with a computed expiry and
deducts what the plan drew out. The next plan sees free stock, weights recipes that
use it, and charges itself for anything about to expire unused. Watch the
projected-waste line on the shopping list fall over the first month.

### A caution

§9 warns that an optimiser tuned on seed data "will make choices that look fine and
cook badly", and that is still true here. The weights in `lib/meal/optimiser.ts`
are all expressed in pounds so they can be argued with, and the pack prices in
`seed-ingredients.ts` are mid-range guesses. Correct prices as you shop — relative
pack economics are what the optimiser actually needs, and those stay stable long
after the absolute figures are stale. A re-seed never overwrites a price you have
edited.

## Deploying (Cloudflare Workers)

Built with [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). In the
Cloudflare dashboard, under Settings -> Build:

| Field | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |

Both are required. Setting only the deploy command fails with
`Could not find compiled Open Next config` — there is no build output to ship.

Secrets (Settings -> Variables and Secrets, as **Secret**, not plaintext):

- `DATABASE_URL` - Supabase transaction pooler, port 6543
- `DIRECT_URL` - Supabase session pooler, port 5432
- `ANTHROPIC_API_KEY` - only needed for chat macro estimation
- `ANTHROPIC_WORKSPACE_ID` - only for an identity-linked key

Served at **https://www.jackwebberley.com/gym**. `basePath: "/gym"` in
`next.config.ts` prefixes every route and asset; the Worker routes in
`wrangler.jsonc` match only `/gym*`, leaving the rest of the site untouched.

Postgres reaches Supabase through a **Hyperdrive** binding — `pg` cannot complete
the TLS handshake over the Workers socket shim, and Hyperdrive also pools so each
isolate does not open its own connection. The Prisma client is built per request:
Workers forbid sharing sockets across requests, and a cached client hands out a
dead one, which hangs until the runtime cancels it.

`nodejs_compat` is set in `wrangler.jsonc` and is not optional: Prisma's `pg`
adapter opens a real TCP socket to Postgres.

Building locally on Windows needs Developer Mode enabled — OpenNext creates
symlinks while tracing dependencies, which otherwise fails with `EPERM`. The
Cloudflare builders run Linux and are unaffected.

## Layout

The tab bar carries the daily loop and nothing else — **Today**, **Train**,
**Food**, **More**. Today is the dashboard: where you are against the day's
protein and calorie targets, and the next session in the rotation, both
actionable in place. Train is the full rotation view. Everything you set up once
and rarely revisit — groups, cycles, the exercise library, goals, the food
library, history — lives behind More.

```
app/
  page.tsx                    Today — the dashboard: food targets + next session
  train/                      the rotation: what is next, what follows, quick starts
  train/[sessionId]/          the logging screen + rest timer
  more/                       hub for setup, libraries and history
  groups/                     create and edit exercise groups
  cycles/                     order groups into a rotation
  exercises/                  library, custom exercises, notes, rest defaults
  history/                    past sessions, per-exercise e1RM
  food/                       daily tracking, chat + manual entry
  food/goals/                 calorie and protein targets
  food/library/               saved foods, aliases, corrections
  food/ready-now.tsx          planned servings, logged in one tap
  meals/                      the menu, the pool, the readout
  meals/plan/                 the brief: how many meals, how sure the week is
  meals/[id]/                 review: lock, swap, reroll, confirm
  meals/[id]/shopping/        the shop by aisle, with the waste line
  meals/recipes/              the recipe library
  meals/pantry/               leftover stock and expiry dates
  meals/household/            her targets, and how a day divides
lib/
  relative-day.ts             "yesterday", "3 days ago" — shared by Today and Train
  progression.ts              §4.3 progression cues — pure, rule-based, tested
  rotation.ts                 §4.1 what comes next — pure, tested
  prefill.ts                  §4.2 prefill from last time — pure, tested
  units.ts                    kg/kcal only, Epley e1RM
  day.ts                      §11 local-date keys, day targets — pure, tested
  anthropic.ts                owns the API client; only two modules may use it
  nutrition.ts                §5.2 macro estimation — one of those two
  nutrition-queries.ts        read models for the food screens
  nutrition-actions.ts        every nutrition mutation
  meal/types.ts               plain domain types, no Prisma
  meal/portions.ts            §8.5 scaling and ingredient quantities — pure, tested
  meal/envelopes.ts           what a meal of each type should land on — pure, tested
  meal/packs.ts               §8.1 cooking quantities → shop quantities — pure, tested
  meal/basket.ts              §8.4 costing the shop and the waste — pure, tested
  meal/optimiser.ts           §8.4 the search — pure, tested, deterministic
  meal/generate.ts            §8.3 recipe generation — the other API caller
  meal-queries.ts             read models for the meal screens
  meal-actions.ts             every meal mutation
  queries.ts                  read models for the screens
  actions.ts                  every mutation
prisma/
  schema.prisma               all models
  seed.ts                     exercise library + starter cycle
  seed-ingredients.ts         UK ingredients with pack sizes and prices
  seed-meals.ts               seeds those, plus starter recipes
```

The pure modules in `lib/` hold every rule that could silently mislead you for
months if it were wrong, which is why they carry all the tests (spec §11). For
the planner that means the whole optimiser: what a pack costs, what a surplus is
worth, how a dish scales, and what the search actually optimises for.

## Notes

- Weights are stored in kg and energy in kcal throughout. Conversion, if it ever
  happens, belongs in the display layer only.
- The UI implements the Jack Webberley design system. Tokens are transcribed
  verbatim into `app/globals.css` from the standalone site export; `components/ui.tsx`
  mirrors its component library (Button, Card, Tag, Badge, Input, Select) with the
  same variants and sizes. Fonts are Schibsted Grotesk, Instrument Serif (display
  headings) and JetBrains Mono (numerals, tags), self-hosted via `next/font`.
- Light is the default, matching the system's `:root`; the toggle on Today (and
  under More → Appearance) switches to its `[data-theme="dark"]` block, and the
  first load follows the device.
- Not yet built from Phase 1's scope in the spec: PWA install and offline
  logging, and the 1RM-over-time and volume-per-muscle-group charts (spec §4.4
  puts those in Phase 5).
