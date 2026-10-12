# MedicApp for phones

The native app for staff, built with Expo (SDK 57) and Expo Router. It uses the same server and database as the web app, so anything recorded here shows up there straight away.

## What staff can do

- **Shift**: clock in and out using the phone's own GPS. The geofence is drawn on screen, and the server still makes the on-site decision.
- **Meds**: the day's round. Record a dose as given, refused or held, and give as-needed (PRN) doses with their limits checked.
- **Inbox**: read messages, acknowledge them, and reply.
- **Account**: who is signed in, which server the app is using, and sign out.

Admins who sign in get a read-only **Overview** of the day: the medication round, late doses, who is on shift and recent clock activity. Managing patients, staff, messages and settings stays in the web app.

## Run it

1. Start the server from the folder above this one:

   ```bash
   npm start
   ```

2. In this folder, install once and start Expo:

   ```bash
   npm install
   ```

   ```bash
   npm start
   ```

3. Press `i` for the iOS simulator or `a` for an Android emulator, or scan the QR code with the Expo Go app on a phone.

Sign in with the demo accounts listed in the main [README](../README.md).

### Pointing the app at the server

The app reads the server address from `EXPO_PUBLIC_API_URL`. Copy `.env.example` to `.env.local` and edit it.

| Where the app runs | Address to use |
|---|---|
| Anywhere, against the published server | `https://aghnfdzewevmbznfmxja.supabase.co/functions/v1` |
| iOS simulator | `http://localhost:3000` (the default) |
| Android emulator | `http://10.0.2.2:3000` (the default on Android) |
| A real phone | Your computer's address on the same Wi-Fi, for example `http://192.168.1.20:3000` |

The published server is the simplest choice for a real phone: it is HTTPS and reachable from anywhere, with the accounts you created on the web.

To use a real phone against the copy on your computer instead, also start the server so other devices can reach it:

```bash
HOST=0.0.0.0 npm start
```

### Trying the geofence in a simulator

A simulator has no GPS, so give it a location: in the iOS Simulator choose **Features > Location > Custom Location** and enter the facility's coordinates from **Settings** in the web app. Enter somewhere else to see the block.

## How it is put together

```
src/
  app/          routes only (Expo Router). Each file renders a screen from src/screens
    _layout.tsx       providers, and which screens each role may reach
    sign-in.tsx
    (staff)/          the four tabs, each with its own navigation stack
    admin/            the admin overview
    record-dose.tsx   a sheet: given, refused or held
    prn-dose.tsx      a sheet: an as-needed dose
  screens/      the screens themselves
  components/   shared building blocks: button, badge, grouped list, callout…
  theme/        design tokens: colour, spacing, type, radius, shadow, motion
  api/          the server client, types, and data hooks (TanStack Query)
  hooks/        the session (token kept in the device keychain), the clock
  utils/        formatting and location
```

It follows the Expo skills in the `skills` repo:

- **Design system**: every colour, size and radius comes from `src/theme`. Backgrounds, labels and separators are the platform's own semantic colours, so the app follows light and dark mode and looks native on each platform. The forest accent and status colours are declared as light/dark pairs.
- **Native UI**: the platform tab bar (`NativeTabs`), navigation-bar titles, form sheets with a grabber, SF Symbols on iOS and Material Symbols on Android, grouped lists instead of a card per row.
- **Data**: every screen has loading, error, empty and content states. A failed refresh keeps the last content on screen. A failed save keeps what was typed.

## What has and has not been tested

- The app **type-checks** against SDK 57 (`npm run typecheck`) and **bundles for both iOS and Android**.
- The server routes it uses, including sign-in with a token, are covered by the same checks as the web app.
- It has **not yet been run on a simulator or a phone**. Expect to find small layout or behaviour issues on first run.

## Before real use

- **HTTPS**: Expo Go allows plain `http://` while developing. A released build does not, on either platform, so the server needs a real HTTPS address first.
- **Icons and name**: the icons are Expo's placeholders. Replace the files in `assets/images` and the identifiers in `app.json`.
- **Store builds**: releasing to the App Store or Play Store is done with EAS Build, which needs an Expo account and developer accounts with Apple and Google.
