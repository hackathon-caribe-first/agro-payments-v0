// Where the mock keeps the signed-in user id (never a secret). The browser uses localStorage, wrapped in try/catch because
// it can be blocked or full; the server (SSR, tests) and any failure fall back to memory.

export interface SessionStore {
  read(): string | null;
  write(userId: string): void;
  clear(): void;
}

const KEY = "surco.session";

export function createSessionStore(): SessionStore {
  let memory: string | null = null;
  const storage = (): Storage | null => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };
  return {
    read() {
      try {
        return storage()?.getItem(KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    write(userId) {
      memory = userId;
      try {
        storage()?.setItem(KEY, userId);
      } catch {
        // memory fallback
      }
    },
    clear() {
      memory = null;
      try {
        storage()?.removeItem(KEY);
      } catch {
        // memory fallback
      }
    },
  };
}
