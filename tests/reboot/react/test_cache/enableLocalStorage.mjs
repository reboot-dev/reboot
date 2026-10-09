// Node.js >= 25 defines a `localStorage` global of its own, which reads
// as `undefined` unless Node runs with `--localstorage-file`, and
// vitest's `jsdom` environment keeps a global that already exists over
// jsdom's. Install an in-memory Web Storage so the page under test has a
// working `localStorage`, scoped to this test file as jsdom's was.
class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.get(String(key)) ?? null;
  }

  setItem(key, value) {
    this.#items.set(String(key), String(value));
  }

  removeItem(key) {
    this.#items.delete(String(key));
  }

  clear() {
    this.#items.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
