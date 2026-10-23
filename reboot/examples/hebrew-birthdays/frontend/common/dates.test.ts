import { describe, expect, it } from "vitest";
import { eveningBefore, formatGregorian, localToday, whenText } from "./dates";

describe("dates", () => {
  it("says today in the viewer's own calendar", () => {
    expect(localToday(new Date(2026, 9, 3, 23, 30))).toBe("2026-10-03");
  });

  it("formats a date without sliding across time zones", () => {
    expect(formatGregorian("2026-11-09")).toBe("Mon, Nov 9, 2026");
    expect(formatGregorian("")).toBe("");
  });

  it("starts a birthday on the evening before", () => {
    expect(eveningBefore("2026-11-09")).toBe("Sun, Nov 8");
    expect(eveningBefore("2027-01-01")).toBe("Thu, Dec 31");
  });

  it("says how far away a birthday is", () => {
    expect(whenText(0)).toBe("Today!");
    expect(whenText(1)).toBe("Tomorrow");
    expect(whenText(17)).toBe("in 17 days");
  });
});
