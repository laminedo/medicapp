# MedicApp

A nursing home staff app: geofenced clock-in, medication rounds, and messages between admin and staff.

There are two parts:

- **The web app and server** (this folder): a single-page app with a small Node backend and a SQLite database. There is nothing to install: it uses only what ships with Node.
- **A native phone app** for staff, built with Expo, in [`mobile/`](mobile/README.md). It talks to the same server.

It is published at **https://laminedo.github.io/medicapp/** (see [The published version](#the-published-version)). Everything below up to that section is about running it on your own computer.

## Run it

Needs Node 22.13 or newer (built and tested on Node 24).

```bash
npm start
```

Then open http://localhost:3000. The first run creates `data/medicapp.db` and fills it with sample data.

## Demo sign-ins

| Username | Password | Who | When the demo starts |
|---|---|---|---|
| `admin` | `maple-admin-2026` | Grace Okafor, Director of Nursing (Admin) | |
| `amara` | `maple-staff-2026` | Amara Diallo, Registered Nurse | On shift: use her to try clocking out |
| `james` | `maple-staff-2026` | James Whitfield, Licensed Practical Nurse | On shift during the day |
| `sofia` | `maple-staff-2026` | Sofia Reyes, Medication Aide | Off shift: use her to try clocking in |

These are defined in `server/seed.js`. Change the passwords or remove the accounts before any real use.

## Try the geofence in two minutes

The sample facility sits at a placeholder location, so your first clock-in attempt will be blocked. That is the block working.

1. Sign in as `sofia` and press **Clock in**. Allow location when the browser asks. You should see "You must be on-site to clock in."
2. Sign out (your name, bottom left), sign in as `admin`, and open **Settings**.
3. Press **Use my current location**, then **Save settings**.
4. Sign back in as `sofia` and press **Clock in** again. It now succeeds.
5. As `admin`, open **Attendance** to see both the blocked attempt and the successful clock-in, with times and coordinates.

Use a normal browser window (Chrome, Safari, Edge) for this. Embedded preview panes often cannot share location.

## What it does

**Clocking in and out**
- Clock-in is allowed only inside the facility's radius. The server measures the distance; the page cannot overrule it.
- Blocked attempts are recorded too, so an admin can see them.
- Clock-out is never blocked (nobody should be stuck on shift after leaving the building). It is still located, and flagged "Off-site" if it happens outside the radius.
- If someone forgets to clock out, an admin can close the shift for them, choosing the time they left and giving a reason. The record shows who entered it.

**Hours worked**
- **Attendance > Hours worked** pairs each clock-in with the clock-out that follows it, and totals the completed shifts per person for any date range.
- A shift still in progress is shown but not counted.
- **Download CSV** exports the same shifts and totals for payroll.

**Medication rounds**
- Each patient has medications with a dosage and one or more times of day.
- The day's doses are worked out from those schedules. A dose can be given from 1 hour before its time, is **overdue** 30 minutes after, and **missed** 2 hours after. These numbers live at the top of `server/schedule.js`.
- A dose is recorded as **given**, **refused** or **held**. Each records who did it and when; refused and held need a reason. A missed dose can still be recorded late for up to 12 hours, with a required note.
- Doses still open at midnight carry over, so a night shift does not lose them.
- Editing a medication's name, dosage or times starts a new version of it, so earlier days keep the schedule they really had.

**As-needed (PRN) medications**
- A medication can be set to "as needed" instead of a schedule, with optional limits: hours between doses, and most doses in 24 hours.
- Staff give a reason for every as-needed dose. If a dose would break a limit they are warned and must confirm it first.

**Correcting mistakes**
- An admin can **void** a record from the medication report, with a reason. Nothing is deleted: the voided entry stays in the report with who voided it and why, and a scheduled dose becomes open again so it can be recorded correctly.

**Messages**
- Admin sends to one staff member or to everyone, optionally marked important.
- Staff read them in an inbox with an unread count, and can **acknowledge** a message or **reply** to it.
- Replies are a private thread between that staff member and the admins, even when the message went to everyone. Admin sees who has read and acknowledged each message, is badged for new replies, and can answer in the thread.

**Accounts**
- There is no public sign-up. On an empty database the first person in creates the admin account once; after that only an admin can add accounts.
- Admin adds, edits and removes accounts. Removing signs the person out and blocks sign-in, but keeps their clock history and medication records.

## Project layout

```
server/
  app.js          the whole API as one router, shared by every way of running it
  index.js        running it under Node: http server, static files, SQLite
  router.js       routing, JSON bodies, role guards, validation helpers
  config.js       how this copy is being run (production, demo data, setup code)
  db.js           the database as the server sees it (engine-neutral, async)
  db-sqlite.js    the SQLite engine and its migrations
  seed.js         sample data and the demo accounts
  auth.js         password hashing (scrypt), sessions, sign-in throttling
  time.js         the facility's time zone: local dates and times of day
  geo.js          distance between two coordinates
  schedule.js     builds a day's medication tasks, statuses and PRN limits
  shifts.js       pairs clock-ins with clock-outs into worked shifts
  routes/         auth, setup, users, facility, clock, patients, tasks, messages, dashboard, reports
supabase/
  functions/api/  the Edge Function entry point and the Postgres engine
  migrations/     the Postgres schema
public/
  index.html
  config.js           where the server is (same address, or Supabase on GitHub Pages)
  css/tokens.css      the theme: every colour, size, radius, shadow and duration
  css/base.css        reset and base type
  css/components.css  buttons, lists, forms, sheets, badges, the app shell
  css/screens.css     layout specific to one screen
  js/app.js           sign-in state, shell, routing
  js/api.js           talks to the server (cookie or token, depending on hosting)
  js/ui.js            the shared component kit
  js/ring.js          the geofence drawing
  js/clock.js         how clock events read, and the admin clock-out sheet
  js/screens/         one file per screen
mobile/               the native phone app (Expo). See mobile/README.md
Dockerfile            for hosts that run the Node server with a disk
```

The SQLite database upgrades itself. Schema changes are ordered migrations in `server/db-sqlite.js`, so starting a newer version of the server against an older database keeps the data.

## Design

The interface follows two references:

- **scroll-craft**'s taste floor: a 4px spacing scale, one type family with tracking that tightens as size grows, six colour roles with one accent, three elevation steps tinted to the canvas, motion under 300ms that never eases in, and its refuse list (no gradient text, no emoji as icons, no grids of identical cards).
- **Expo's design-system skill**: one token theme, a small set of shared components with variants, sizes and states, grouped lists instead of a card per row, and four states (loading, error, empty, content) on every data screen.

To rebrand, change the six colour roles at the top of `public/css/tokens.css`. Light and dark themes follow the device setting.

## The published version

The app is published in two parts:

| Part | Where | Address |
|---|---|---|
| The pages (what you see) | GitHub Pages, from this repository's `gh-pages` branch | https://laminedo.github.io/medicapp/ |
| The server and database | Supabase project `medicapp`: one Edge Function (`api`) on Postgres | `https://aghnfdzewevmbznfmxja.supabase.co/functions/v1/api` |

The published version runs in **production mode**: no sample data and no demo accounts. The first visit shows a one-time setup screen that creates the admin account.

### First visit

1. Open https://laminedo.github.io/medicapp/.
2. Enter the **setup code** from `setup-code.local.txt` (kept on the computer the app was installed from, never uploaded), name your care home, and create your admin account. The code stops working once that account exists.
3. In **Settings**, press **Use my current location** while you are at the building, check the **time zone**, and save. Staff cannot clock in until the location is set.
4. Add your staff in **Staff**, and your residents in **Patients**.

### Releasing changes

- **Pages** (anything in `public/`): commit, then run `npm run publish:pages`. GitHub Pages updates within a minute or two.
- **Server** (anything in `server/`): the Supabase function loads the server code from this repository at one exact commit. Push the change, put the new commit id in the five import addresses at the top of `supabase/functions/api/index.ts`, and deploy that function again (`supabase functions deploy api --no-verify-jwt`, or from the Supabase dashboard).
- **Database**: the tables are created by `supabase/migrations/0001_schema.sql`. Add a new numbered file for any change and apply it to the Supabase project.

### Good to know

- **The repository is public**, because free GitHub Pages requires it. It contains code only. The demo passwords further up work on the sample data on your own machine, not on the published app.
- **Free Supabase projects pause after about a week with no use.** Open the Supabase dashboard and press Restore to wake it. A paid plan does not pause.
- **Signing in** on the published site keeps you signed in on that device for 12 hours. Use Sign out on shared computers.
- **The tables are not reachable through Supabase's public API.** Row level security is on with no policies, so only the `api` function can read or write them. Supabase's security checker lists this as an informational note for each table; that is the intended setup.

### Other ways to host it

The same server also runs under plain Node with a built-in SQLite database, which is how it runs on your own machine. The repository includes a `Dockerfile` for hosts that keep a disk (Railway, Fly.io, a VPS): mount a volume, set `MEDICAPP_SETUP_CODE`, and the server serves the pages itself, so GitHub Pages and Supabase are not needed.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to accept other devices. |
| `MEDICAPP_DATA_DIR` | `./data` | Where the database file lives. On Railway the attached volume is used automatically. |
| `NODE_ENV` | (unset) | `production` turns off the sample data and requires a setup code and a persistent disk. The Dockerfile sets it. |
| `MEDICAPP_SETUP_CODE` | (unset) | The phrase needed to create the first admin account. Required in production. |
| `MEDICAPP_DEMO` | (automatic) | `1` forces the sample data on, `0` forces it off. |
| `MEDICAPP_ALLOWED_ORIGINS` | (none) | Other web addresses allowed to call this server from a browser, comma-separated. Only needed if the pages are hosted somewhere else. |

These apply when the server runs under Node. The Supabase function sets its own values in `supabase/functions/api/index.ts`.

To run the phone app, see [`mobile/README.md`](mobile/README.md).

To wipe the database and load the sample data again, stop the server and run:

```bash
npm run reset
```

## Before using this with real residents

This is a working prototype, not a certified medical records system. At minimum:

- **Use the HTTPS address.** Phones only share location with secure sites. The published version is HTTPS already; a copy on plain `http://` on a local network cannot clock anyone in.
- **Never publish the demo accounts.** Their passwords are in this file. Production mode leaves them out; give every person their own sign-in.
- **Know the limits of browser location.** It can be spoofed by a determined person, and indoor accuracy varies. Treat the clock log as a strong signal, not proof.
- **Back up the data.** On your own machine it is one SQLite file in `data/`. On Supabase, free projects have no automatic backups: export the database from the dashboard, or move to a paid plan.
- **Check your obligations.** Resident health information is regulated (HIPAA in the US, GDPR in Europe). That covers hosting, access logging, retention and more than this prototype provides.
