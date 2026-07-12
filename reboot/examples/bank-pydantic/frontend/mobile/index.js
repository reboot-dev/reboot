// `react-native-get-random-values` must be imported before anything
// that touches `crypto.getRandomValues`. The Reboot client uses the
// `uuid` package to generate idempotency keys, and `uuid` reads
// `crypto.getRandomValues` at import time, which React Native's
// (Hermes) runtime does not provide on its own. On web this import is
// a no-op because the browser already has Web Crypto.
import "react-native-get-random-values";

import { registerRootComponent } from "expo";

import App from "./src/App";

// `registerRootComponent` calls `AppRegistry.registerComponent("main",
// () => App)` and sets up the environment for both Expo Go and native
// builds.
registerRootComponent(App);
