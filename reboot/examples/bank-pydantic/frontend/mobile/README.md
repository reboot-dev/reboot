# Bank — React Native (Expo) front end

This is a [React Native](https://reactnative.dev/) front end for the
`bank-pydantic` example, built with [Expo](https://expo.dev/). It talks
to the same Reboot backend as the `frontend/web/` front end and demonstrates
that the Reboot React client (`@reboot-dev/reboot-react`) runs in React
Native — on iOS, Android, and the web — in addition to the browser.

The UI is the browser example ported to React Native primitives
(`View`, `Text`, `TextInput`, `Pressable`, `ScrollView`); the Reboot
integration (`RebootClientProvider`, the generated `useUser` hook,
reactive `useBalances`, and optimistic `openAccount`/`transfer`) is
identical to `frontend/web/`. The browser's `<select>` dropdowns
become tappable "chip" pickers, since React Native has no native
`<select>`.

## Signing in

Like the web front end, this app requires signing in, and it reaches
the same OAuth server with the same `useSignIn()`, `useSignOut()`, and
generated `useUser()` hooks. What differs is only how the sign-in
itself runs: the browser-redirect flow needs a `window.location` to
redirect and a cookie jar to hold the session, neither of which React
Native has. So `App.tsx` hands `RebootClientProvider` a
`nativeAuth({...})` from `@reboot-dev/reboot-react/native`:

```tsx
const auth = expoAuth({ WebBrowser, SecureStore, Linking });

<RebootClientProvider url={REBOOT_URL} nativeAuth={auth}>
```

Reboot then runs the standard authorization-code flow with PKCE that
native apps use — discovery, client registration, PKCE, the token
exchange, and refreshing the access token before it expires — and
everything above `RebootClientProvider` is written exactly as it is
for the web.

The three modules passed in are the things React Native has no
standard answer for: a browser to run the flow in
([`expo-web-browser`](https://docs.expo.dev/versions/latest/sdk/webbrowser/)),
the device keychain to keep the refresh token in
([`expo-secure-store`](https://docs.expo.dev/versions/latest/sdk/securestore/)),
and the URL builder that turns `app.json`'s `scheme` into the redirect
URI ([`expo-linking`](https://docs.expo.dev/versions/latest/sdk/linking/)).
Passing them rather than having Reboot import them keeps
`@reboot-dev/reboot-react` free of any dependency on a particular
React Native toolchain — a bare React Native app supplies its own
equivalents to `nativeAuth` instead — and lets this app's own
type-checker confirm its installed Expo version matches what Reboot
expects.

`expoAuth` also handles the two things the web bundle of this app
needs: `expo-secure-store` doesn't exist there, so the session falls
back to `sessionStorage`, and the OAuth flow runs in a popup that has
to hand its result back to the window that opened it.

The app registers itself with the OAuth server dynamically, and the
backend recognizes it as first-party because
`backend/src/main.py` claims its redirect URI through
`Application(native_redirect_uris=[...])` — so the user goes straight
to the identity provider with no consent screen in between. Expo Go's
`exp://` development redirect URI is trusted automatically under `rbt
dev run`, so a `npm start` / `npm run ios` / `npm run android` run
needs no configuration.

Running the app in a browser (`npm run web`) is the exception: its
redirect URI is an ordinary `http://localhost:<port>/redirect`, which
is indistinguishable from the redirect URI an MCP client registers, so
Reboot does not trust it by shape and the sign-in shows a consent
screen. That is a quirk of running a mobile app in a browser, not of
the mobile flow; the real web front end is `frontend/web/`.

## React Native compatibility

React Native does not provide every web API the Reboot client relies
on. This example covers the gaps as follows:

- **`crypto.getRandomValues`** (used by the `uuid` package for
  idempotency keys) is polyfilled by importing
  [`react-native-get-random-values`](https://github.com/LinusU/react-native-get-random-values)
  at the very top of `index.js`, before any Reboot code loads. On the
  web this import is a no-op because the browser already has Web
  Crypto.
- **Streaming `fetch` responses** (used by Reboot's reactive readers)
  work because Expo SDK 52+ installs the WinterCG-compliant
  [`expo/fetch`](https://docs.expo.dev/versions/latest/sdk/expo/#expofetch)
  as the global `fetch` on native, which supports
  `response.body.getReader()`.

The remaining gaps are handled inside the Reboot framework itself, so
apps don't need to patch the client.

## Run it

### 1. Start the backend

From the `bank-pydantic` directory, exactly as for the `frontend/web/` front end
(see the top-level [`README.md`](../../README.md)):

```sh
rbt dev run
```

That generates the Reboot client code and serves the application. It
prints `http://127.0.0.1:9991`, but it actually binds to all
interfaces, so it is also reachable from a simulator and from a phone
on the same network at your machine's LAN IP.

### 2. Build the front end

From this directory:

```sh
npm install
```

Step 1's `rbt dev run` already generates the typed Reboot client into
`frontend/api/`, shared with the web app (the example's top-level
`.rbtrc` configures this via `generate --react=frontend/api`), so
`npm install` is all you need here. To regenerate the clients on
their own, run `rbt generate` from
the `bank-pydantic` directory.

### 3. Run it

#### Browser (react-native-web)

```sh
npm run web
```

#### iOS simulator

```sh
npm run ios
```

The default backend URL (`http://localhost:9991`) works from the
simulator, so no extra configuration is needed. The first launch
downloads and installs Expo Go into the simulator; if that initial
auto-open times out (it can, right after the install), just run
`npm run ios` again — Expo Go is now installed — or open the app
manually:

```sh
xcrun simctl openurl booted exp://127.0.0.1:8081
```

#### Physical device (iOS or Android)

A phone can't reach `localhost`, so point the app at your machine's LAN
IP (and make sure the phone is on the same Wi-Fi). `npm start` runs an
interactive Metro that prints a scannable QR code:

```sh
# Find your LAN IP (macOS): ipconfig getifaddr en0
EXPO_PUBLIC_REBOOT_URL=http://192.168.1.42:9991 npm start
```

Open the project in [Expo Go](https://expo.dev/go) on the phone by
scanning that QR — with the iOS Camera app (tap "Open in Expo Go") or
with Expo Go's own "Scan QR code". Note that Expo Go's "Development
servers" list relies on local-network discovery and may stay empty
even when everything is reachable; scanning the QR sidesteps it.

### Pointing at the backend

The app reads its server URL from the `EXPO_PUBLIC_REBOOT_URL`
environment variable, falling back to `http://localhost:9991`. Set it
to whatever the target can actually reach:

| Target              | `EXPO_PUBLIC_REBOOT_URL`    |
| ------------------- | --------------------------- |
| Browser / iOS sim   | (unset — `localhost` works) |
| Physical device     | `http://<your-LAN-IP>:9991` |
