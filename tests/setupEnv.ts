class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
}

const ensureStorage = (storageKey: "localStorage" | "sessionStorage") => {
  const existing = (globalThis as any)[storageKey] as unknown;
  const hasGetItem =
    typeof (existing as any)?.getItem === "function" &&
    typeof (existing as any)?.setItem === "function";

  if (hasGetItem) return;

  Object.defineProperty(globalThis, storageKey, {
    value: new MemoryStorage(),
    configurable: true,
  });
};

ensureStorage("localStorage");
ensureStorage("sessionStorage");

