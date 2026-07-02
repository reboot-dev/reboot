import {
  RebootClientProvider,
  useSignIn,
  useSignOut,
} from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useUser } from "@api/ping_api_zod_rbt_react";
import { App } from "./App";

const Root = () => {
  const { user, isLoading } = useUser();
  const signIn = useSignIn();
  const signOut = useSignOut();
  // The provider renders us immediately and resolves the default user
  // ID in the background, so we see `isLoading` until `/whoami` lands.
  if (isLoading) {
    return <main className="loading">Checking session…</main>;
  }
  if (user === undefined) {
    return (
      <main className="signin-prompt">
        <h1>Ping</h1>
        <p>Sign in to manage counters from the browser.</p>
        <button onClick={() => signIn()}>Sign in</button>
      </main>
    );
  }
  return <App user={user} onSignOut={() => void signOut()} />;
};

// This SPA is served same-origin behind the app's built-in HTTP server
// at `/__/frontend/web/`, so the provider auto-detects the backend URL
// from `window.location.origin` — no explicit `url` needed.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
