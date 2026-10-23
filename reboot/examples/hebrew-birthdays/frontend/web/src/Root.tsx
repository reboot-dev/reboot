import { useUser } from "@api/birthdays/v1/user_rbt_react";
import { useSignIn, useSignOut } from "@reboot-dev/reboot-react";
import { Cake } from "lucide-react";
import { type FC, type ReactNode } from "react";
import App from "./App.tsx";

// A full-page centered shell for the states where nobody is signed
// in yet, on the same backdrop as the signed-in app.
const Shell: FC<{ children: ReactNode }> = ({ children }) => (
  <main className="min-h-screen bg-gradient-to-b from-indigo-950 via-indigo-900 to-slate-900 flex items-center justify-center px-4">
    {children}
  </main>
);

const SignIn: FC = () => {
  const signIn = useSignIn();
  return (
    <Shell>
      <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 sm:p-10 border border-amber-300/20 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
          <Cake className="w-9 h-9 text-amber-300" />
          Hebrew Birthdays
        </h1>
        <p className="text-amber-100/90 text-lg mb-6" lang="he" dir="rtl">
          יום הולדת שמח
        </p>
        <p className="text-indigo-100/80 mb-8">
          Never miss a Hebrew birthday again. Add the people you love, and
          see when each one's Hebrew birthday falls this year.
        </p>
        <button
          onClick={() => signIn()}
          className="w-full bg-amber-400 text-indigo-950 font-semibold py-3 px-6 rounded-lg hover:bg-amber-300 transition-colors shadow-lg"
        >
          Sign in
        </button>
      </div>
    </Shell>
  );
};

// Branches on whether the user is signed in: a loading state while
// the session resolves, a sign-in page when nobody is signed in, and
// the per-user `App` once somebody is.
export const Root: FC = () => {
  const { user, isLoading } = useUser();
  const signOut = useSignOut();
  // The provider renders us immediately and resolves the signed-in
  // user in the background, so we see `isLoading` until `/whoami`
  // lands.
  if (isLoading) {
    return (
      <Shell>
        <p className="text-indigo-100 text-lg animate-pulse">
          Checking session…
        </p>
      </Shell>
    );
  }
  if (user === undefined) {
    return <SignIn />;
  }
  return <App user={user} onSignOut={() => void signOut()} />;
};
