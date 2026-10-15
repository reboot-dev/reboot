// frontend/web/src/main.tsx
import { useUser } from "@api/mcp_ui_counter/v1/counter_rbt_react";
import {
  RebootClientProvider,
  useSignIn,
  useSignOut,
} from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const Root = () => {
  const { user, isLoading } = useUser();
  const signIn = useSignIn();
  const signOut = useSignOut();
  // The provider renders us immediately and resolves the signed-in
  // user in the background, so we see `isLoading` until `/whoami`
  // lands.
  if (isLoading) {
    return <main className="loading">Checking session…</main>;
  }
  if (user === undefined) {
    return (
      <main className="signin-prompt">
        <h1>Chat Counter</h1>
        <p>Sign in to create and browse your counters.</p>
        <button onClick={() => signIn()}>Sign in</button>
      </main>
    );
  }
  return <App user={user} onSignOut={() => void signOut()} />;
};

// The Reboot client finds the backend on its own in development:
// the backend serves this SPA from the Vite dev server at its own
// origin (`--web-app-url`), so it is same-origin, as it is when the
// backend serves the built SPA (`--web-app-dist-path`); opened at the
// dev server's own URL instead, on a plain Vite port, it assumes
// Reboot's default `http://localhost:9991`. Only a deploy on a CDN or
// static host, cross-origin to the backend, MUST set
// `VITE_REBOOT_URL` to the backend's origin (`web/.env.production`).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
