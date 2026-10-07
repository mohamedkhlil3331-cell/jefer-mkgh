import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "@/context/AuthContext";
import { VIEW_STATE_PREFIX } from "@/lib/remembered-view-storage";

function initialValue<T>(value: T | (() => T)): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

function readState<T>(key: string, initial: T | (() => T)): T {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored) as T;
  } catch {
    // Storage may be disabled, or a previous value may no longer be valid JSON.
  }
  return initialValue(initial);
}

/** Remembers list controls when their page unmounts; never stores forms or server data. */
export function useRememberedState<T>(
  name: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const key = `${VIEW_STATE_PREFIX}${user?.role ?? "guest"}:${user?.id ?? "guest"}:${window.location.pathname}:${name}`;
  const [entry, setEntry] = useState(() => ({ key, value: readState(key, initial) }));
  const value = entry.key === key ? entry.value : readState(key, initial);
  // A page may remain mounted while its path or account changes. Rehydrate
  // before its effects can save the previous page's value under the new key.
  if (entry.key !== key) setEntry({ key, value });
  const setValue: Dispatch<SetStateAction<T>> = useCallback(update => {
    setEntry(previous => {
      const current = previous.key === key ? previous.value : readState(key, initial);
      return {
        key,
        value: typeof update === "function"
          ? (update as (previous: T) => T)(current)
          : update,
      };
    });
  }, [key]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Keep the controls working even when session storage is unavailable.
    }
  }, [key, value]);
  return [value, setValue];
}
