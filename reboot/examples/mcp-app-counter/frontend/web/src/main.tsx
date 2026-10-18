// frontend/web/src/main.tsx
import { useUser } from "@api/mcp_app_counter/v1/counter_rbt_react";
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

// The Reboot client uses the page's own origin, which is the backend:
// in development Envoy serves this SPA from the Vite dev server at
// the backend's origin (`--web-app`), and built, the backend serves it
// itself (`--web-app-dist-path`). Only a web app served from another
// origin — a CDN or static host in production — MUST set
// `VITE_REBOOT_URL` to the backend's origin (`web/.env.production`).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
