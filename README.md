# MedicApp

A nursing home staff app: geofenced clock-in, medication rounds, and messages between admin and staff.

There are two parts:

- **The web app and server** (this folder): a single-page app with a small Node backend and a SQLite database. There is nothing to install: it uses only what ships with Node.
- **A native phone app** for staff, built with Expo, in [`mobile/`](mobile/README.md). It talks to the same server.

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
  index.js        HTTP server, static files, security headers
  router.js       routing, JSON bodies, role guards, validation helpers
  db.js           SQLite connection and schema, as ordered migrations
  seed.js         sample data and the demo accounts
  auth.js         password hashing (scrypt), sessions, sign-in throttling
  geo.js          distance between two coordinates
  schedule.js     builds a day's medication tasks, statuses and PRN limits
  shifts.js       pairs clock-ins with clock-outs into worked shifts
  routes/         auth, users, facility, clock, patients, tasks, messages, dashboard, reports
public/
  index.html
  css/tokens.css      the theme: every colour, size, radius, shadow and duration
  css/base.css        reset and base type
  css/components.css  buttons, lists, forms, sheets, badges, the app shell
  css/screens.css     layout specific to one screen
  js/app.js           sign-in state, shell, routing
  js/ui.js            the shared component kit
  js/ring.js          the geofence drawing
  js/clock.js         how clock events read, and the admin clock-out sheet
  js/screens/         one file per screen
mobile/               the native phone app (Expo). See mobile/README.md
```

The database upgrades itself. Schema changes are ordered migrations in `server/db.js`, so starting a newer version of the server against an older database keeps the data.

## Design

The interface follows two references:

- **scroll-craft**'s taste floor: a 4px spacing scale, one type family with tracking that tightens as size grows, six colour roles with one accent, three elevation steps tinted to the canvas, motion under 300ms that never eases in, and its refuse list (no gradient text, no emoji as icons, no grids of identical cards).
- **Expo's design-system skill**: one token theme, a small set of shared components with variants, sizes and states, grouped lists instead of a card per row, and four states (loading, error, empty, content) on every data screen.

To rebrand, change the six colour roles at the top of `public/css/tokens.css`. Light and dark themes follow the device setting.

## Publish it (Railway)

The repository includes a `Dockerfile`, so a host can build and run it with no extra configuration. Published this way the app runs in **production mode**: it does not load the sample data or the demo accounts, and the first person to open it creates the admin account through a one-time setup screen.

On [Railway](https://railway.com):

1. **New Project → Deploy from GitHub repo**, and choose this repository. Railway finds the `Dockerfile` by itself.
2. **Add a volume** so the database survives deploys: press `⌘K` (or right-click the canvas), choose **Volume**, attach it to the service, and set the mount path to `/data`.
3. **Add a variable** on the service: `MEDICAPP_SETUP_CODE`, set to a phrase only you know.
4. **Get the link**: service **Settings → Networking → Public Networking → Generate Domain**. HTTPS is automatic.
5. Open the link. Enter the setup code, name your care home, and create your admin account.
6. In **Settings**, press **Use my current location** while you are at the building, then save. Staff cannot clock in until this is done.

Setup refuses to run until steps 2 and 3 are done, and says which one is missing. After the first admin exists, the setup screen never appears again.

To use the phone app with the published server, set `EXPO_PUBLIC_API_URL` to the Railway link (see [`mobile/README.md`](mobile/README.md)).

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Address to bind. Use `0.0.0.0` to accept other devices. |
| `MEDICAPP_DATA_DIR` | `./data` | Where the database file lives. On Railway the attached volume is used automatically. |
| `NODE_ENV` | (unset) | `production` turns off the sample data and requires a setup code and a persistent disk. The Dockerfile sets it. |
| `MEDICAPP_SETUP_CODE` | (unset) | The phrase needed to create the first admin account. Required in production. |
| `MEDICAPP_DEMO` | (automatic) | `1` forces the sample data on, `0` forces it off. |

To run the phone app, see [`mobile/README.md`](mobile/README.md).

To wipe the database and load the sample data again, stop the server and run:

```bash
npm run reset
```

## Before using this with real residents

This is a working prototype, not a certified medical records system. At minimum:

- **Serve it over HTTPS.** Phones only share location with secure sites, so clock-in will not work over plain `http://` on a local network. Put it behind a reverse proxy with a certificate, or host it.
- **Never publish the demo accounts.** Their passwords are in this file. Production mode leaves them out; give every person their own sign-in.
- **Know the limits of browser location.** It can be spoofed by a determined person, and indoor accuracy varies. Treat the clock log as a strong signal, not proof.
- **Back up `data/`.** It is a single SQLite file.
- **Check your obligations.** Resident health information is regulated (HIPAA in the US, GDPR in Europe). That covers hosting, access logging, retention and more than this prototype provides.
