import { useState } from "react";

// Like `useState`, but the value is also lazily loaded from
// `localStorage` on mount and written back through the returned
// setter. `parse` returns the typed value if the raw `localStorage`
// string is recognized, else `null` to fall back to `defaultValue`
// — this gates against missing keys, disabled storage, and stale
// values left behind by a previous schema.
//
// On write, the hook is best-effort: if `localStorage.setItem`
// throws (Safari private mode, quota exceeded), we still update
// in-memory state so the UI stays responsive; the choice just
// won't survive a reload.
export function useStoredState<T extends string>(
  storageKey: string,
  parse: (raw: string | null) => T | null,
  defaultValue: T
): [T, (value: T) => void] {
  const [value, setValueState] = useState<T>(() => {
    try {
      return parse(window.localStorage.getItem(storageKey)) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const setValue = (next: T) => {
    setValueState(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Storage may be disabled; the choice just won't persist.
    }
  };
  return [value, setValue];
}
