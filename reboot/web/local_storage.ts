const globalEnv: any = {};

// If window is undefined, the code runs not in a DOM context at all.
if (typeof window === "undefined") {
  globalEnv.window = {};
} else {
  globalEnv.window = window;
}

// Ensures executability in both Node and browser environments, by
// making `global` accessible in the web browser context.
//
// `global` is the Node global variable object,
// which can have a DOM applied, f.ex. with `jsdom`.
//
// `window` is the web browser global variable object.
globalEnv.window.global ||= globalEnv.window;

const data: Record<string, string> = {};
let hasLocalStorage = false;

if (global?.localStorage) {
  try {
    const x = "storageTest";
    localStorage.setItem(x, x);
    localStorage.removeItem(x);
    hasLocalStorage = true;
  } catch {
    hasLocalStorage = false;
  }
}

class LocalStorageUtilities {
  get hasLocalStorage() {
    return hasLocalStorage;
  }

  setItem(key: string, value: string) {
    if (hasLocalStorage) {
      localStorage.setItem(key, value);
    } else {
      data[key] = (value && String(value)) || value;
    }
  }

  getItem(key: string) {
    if (hasLocalStorage) {
      return localStorage.getItem(key);
    }
    return data[key];
  }

  removeItem(key: string) {
    if (hasLocalStorage) {
      localStorage.removeItem(key);
    } else {
      delete data[key];
    }
  }
}

const localStorageUtilities = new LocalStorageUtilities();

export default localStorageUtilities;
