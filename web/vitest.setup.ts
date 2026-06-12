import '@testing-library/jest-dom/vitest';

// Node >= 22 ships an experimental `localStorage` global that shadows jsdom's
// implementation and is undefined unless node runs with --localstorage-file.
// Install an in-memory Storage so component tests can exercise persistence.
if (globalThis.localStorage === undefined) {
  const store = new Map<string, string>();
  const storage: Storage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, value) => {
      store.set(String(key), String(value));
    },
    removeItem: (key) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}
