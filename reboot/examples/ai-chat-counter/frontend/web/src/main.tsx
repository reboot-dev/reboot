// frontend/web/src/main.tsx
import { useUser } from "@api/ai_chat_counter/v1/counter_rbt_react";
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

// Point the Reboot client at the backend via `VITE_REBOOT_URL`. A web
// app is served from its own origin — a CDN or static host — almost
// never same-origin with the Reboot backend, so a real deploy MUST set
// `VITE_REBOOT_URL` to the backend's origin. `web/.env.development`
// sets it for local dev (to the Envoy endpoint), so this SPA runs on
// the Vite dev server cross-origin to the backend — the same shape as
// production.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
