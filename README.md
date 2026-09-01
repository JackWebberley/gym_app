# Gym + Nutrition Tracker

Personal single-user training and nutrition tracker. Built against
[`gym-nutrition-app-spec.md`](./gym-nutrition-app-spec.md).

**Phases 1 and 2 are built** — workout logging, and nutrition tracking with chat
estimation and the personal food library. The feedback loop (§6) and meal planning
(§8) are later phases in §9 of the spec.

## Running it

```bash
npm install          # runs prisma generate afterwards
cp .env.example .env # then paste your two Supabase connection strings
npm run db:check     # proves both connections work before anything else
npm run db:deploy    # applies migrations over the direct connection
npm run db:seed      # 81 exercises + a Push/Pull/Legs starter cycle
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
lib/
  relative-day.ts             "yesterday", "3 days ago" — shared by Today and Train
  progression.ts              §4.3 progression cues — pure, rule-based, tested
  rotation.ts                 §4.1 what comes next — pure, tested
  prefill.ts                  §4.2 prefill from last time — pure, tested
  units.ts                    kg/kcal only, Epley e1RM
  day.ts                      §11 local-date keys, day targets — pure, tested
  nutrition.ts                the ONLY module that calls the Anthropic API (§11)
  nutrition-queries.ts        read models for the food screens
  nutrition-actions.ts        every nutrition mutation
  queries.ts                  read models for the screens
  actions.ts                  every mutation
prisma/
  schema.prisma               Phase 1 models
  seed.ts                     exercise library + starter cycle
```

The three pure modules in `lib/` hold every rule that could silently mislead you
for months if it were wrong, which is why they are the only things with tests
(spec §11).

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
