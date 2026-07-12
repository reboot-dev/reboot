import { useUser } from "@api/bank/v1/user_rbt_react";
import { useSignIn, useSignOut } from "@reboot-dev/reboot-react";
import { Wallet } from "lucide-react";
import { type FC, type ReactNode } from "react";
import App from "./App.tsx";

// A full-page centered shell for the states where nobody is signed
// in yet, on the same gradient backdrop as the signed-in app.
const Shell: FC<{ children: ReactNode }> = ({ children }) => (
  <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
    {children}
  </main>
);

const SignIn: FC = () => {
  const signIn = useSignIn();
  return (
    <Shell>
      <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-10 border border-purple-500/20 text-center">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center justify-center gap-3">
          <Wallet className="w-10 h-10 text-purple-400" />
          Rebank
        </h1>
        <p className="text-purple-200 text-lg mb-8">A Bank Rebooted</p>
        <p className="text-purple-200/80 mb-8">
          Sign in to open accounts, check your balances, and move money between
          your accounts.
        </p>
        <button
          onClick={() => signIn()}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transform hover:scale-[1.02] transition-all duration-200 shadow-lg"
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
        <p className="text-purple-200 text-lg animate-pulse">
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
