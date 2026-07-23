// Ambient declaration for the single Vite env var the `main.tsx`
// snippet reads, so it type-checks without depending on
// `vite/client`.
interface ImportMetaEnv {
  readonly VITE_REBOOT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The repo has no `@types/react-dom`, so declare the one entry point
// the `main.tsx` snippet uses, typed precisely enough that the
// `createRoot(...).render(...)` call is still checked.
declare module "react-dom/client" {
  import type { ReactNode } from "react";

  export function createRoot(container: Element | DocumentFragment): {
    render(children: ReactNode): void;
  };
}
