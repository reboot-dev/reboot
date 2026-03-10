import { assert } from "@reboot-dev/reboot-api";
import { createCacheIdb, LruCacheIndexedDB } from "lru-cache-idb";

import localStorageUtilities from "./local_storage.js";
export { calcSha256 } from "./sha256.js";

export enum OfflineCacheStorageType {
  IndexedDB = "IndexedDB",
  LocalStorage = "LocalStorage",
  InMemory = "InMemory",
}

interface OfflineCacheAccessors {
  offlineCacheStorageType: OfflineCacheStorageType;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

interface OfflineCache extends OfflineCacheAccessors {
  has: (key: string) => Promise<boolean>;
}

const localStorageCache = (): OfflineCacheAccessors => {
  return {
    offlineCacheStorageType: localStorageUtilities.hasLocalStorage
      ? OfflineCacheStorageType.LocalStorage
      : OfflineCacheStorageType.InMemory,
    get: async (key: string) => {
      return localStorageUtilities.getItem(key);
    },
    set: async (key: string, value: string) => {
      localStorageUtilities.setItem(key, value);
    },
    delete: async (key: string) => {
      localStorageUtilities.removeItem(key);
    },
  };
};

const lruIndexedDBCache = (
  readerCacheIdb: LruCacheIndexedDB<unknown>
): OfflineCacheAccessors => {
  return {
    offlineCacheStorageType: OfflineCacheStorageType.IndexedDB,
    get: async (key: string): Promise<string | null> => {
      const value = await readerCacheIdb.get(key);
      return value != null ? (value as string) : null;
    },
    set: async (key: string, value: string) => {
      await readerCacheIdb.set(key, value);
    },
    delete: async (key: string) => {
      await readerCacheIdb.delete(key);
    },
  };
};

const genericCacheFunctionsFactory = (cache: OfflineCacheAccessors) => {
  return {
    has: async (key: string) => {
      const value = await cache.get?.(key);
      return value != null;
    },
  };
};

// Lazily initialized cache to avoid consuming any resources like
// `IndexedDB` and any offline cache instantiation related logs when
// cache is disabled.
let _offlineCache: OfflineCache | null = null;

// Exported for testing purposes only.
export function isOfflineCacheInitialized(): boolean {
  return _offlineCache !== null;
}

export function offlineCache(): OfflineCache {
  if (_offlineCache !== null) {
    return _offlineCache;
  }

  let cacheAccessors: OfflineCacheAccessors;

  try {
    const readerCacheIdb = createCacheIdb({
      databaseName: "reboot-reader-cache",
      // Disable items limit by setting '0'.
      maxItems: 0,
      // Persist in memory items every 5 seconds.
      persistencePeriod: 5000,
    });

    assert(readerCacheIdb != null, "readerCacheIdb is not defined");

    cacheAccessors = lruIndexedDBCache(readerCacheIdb);
  } catch (error) {
    console.log(
      "[Reboot] Using `localStorage` for offline caching because IndexedDB is not available.",
      error
    );

    cacheAccessors = localStorageCache();

    if (
      cacheAccessors.offlineCacheStorageType ===
      OfflineCacheStorageType.InMemory
    ) {
      console.log(
        "[Reboot] Not persisting offline cache because `localStorage` is not available!"
      );
    }
  }

  _offlineCache = {
    ...cacheAccessors,
    ...genericCacheFunctionsFactory(cacheAccessors),
  };

  return _offlineCache;
}
