## `expoAuth()` takes `Expo` and `Constants`

If any file in the app's Expo project calls `expoAuth({` from
`@reboot-dev/reboot-react/native`, pass the `expo` package and the
default export of `expo-constants` alongside the existing modules:

```tsx
import * as Expo from "expo";
import Constants from "expo-constants";

const auth = expoAuth({ Expo, Constants, WebBrowser, SecureStore, Linking });
```

If `expo-constants` is missing from that project's `package.json`,
add it with `npx expo install expo-constants`.

`expoAuth` uses them to build the `exp://` redirect URI under Expo Go
58, which identifies itself as a bare app and so makes
`Linking.createURL` return the app's own scheme, a URL Expo Go cannot
receive. Development and production builds of the app are unaffected.
