import { expect, describe, it } from "vitest";
import * as reboot_web from "@reboot-dev/reboot-web";

import { offlineCacheStorageType } from "../../greeter_rbt_react.js";

describe("Offline cache storage type", () => {
  it("is not initialized before first access", () => {
    expect(reboot_web.isOfflineCacheInitialized()).toBe(false);
  });

  it("is LocalStorage, if IndexedDB is not available", () => {
    expect(offlineCacheStorageType()).toBe("LocalStorage");
  });

  it("is initialized after first access", () => {
    expect(reboot_web.isOfflineCacheInitialized()).toBe(true);
  });
});
