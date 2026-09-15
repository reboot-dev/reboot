// The graph's boxes are sized before they are drawn, so the layout
// works from arithmetic on what they hold: a package's box has to be
// wide enough for its name, which its cards alone do not say.
import { describe, expect, it } from "vitest";
import {
  widthOfCollapsedPackage,
  widthOfExpandedPackageHead,
} from "../../../reboot/dashboard/web/src/graph";

const SHORT = "bank.v1";
const LONG = "rbt.std.collections.ordered_map.v1";

describe("an expanded package's box", () => {
  it("is wider for a longer name", () => {
    expect(widthOfExpandedPackageHead(LONG)).toBeGreaterThan(
      widthOfExpandedPackageHead(SHORT)
    );
  });

  it("holds its name and the collapse link beside it", () => {
    // One card with the box's padding either side comes to 250px,
    // which a name of this length outgrows.
    expect(widthOfExpandedPackageHead(LONG)).toBeGreaterThan(250);
  });
});

describe("a collapsed package's box", () => {
  it("keeps the default width for a name that fits", () => {
    expect(widthOfCollapsedPackage(SHORT)).toBe(200);
  });

  it("grows for a name the default would wrap", () => {
    expect(widthOfCollapsedPackage(LONG)).toBeGreaterThan(200);
  });
});
