import {
  PASSENGER_CATEGORIES,
  buildComposition,
  emptyComposition,
  summarizePassengers,
  toCount,
  totalPassengers,
} from "./passengers";

describe("passenger composition helpers (Issue #23)", () => {
  it("exposes the four canonical categories in display order", () => {
    expect(PASSENGER_CATEGORIES.map((c) => c.key)).toEqual([
      "infants",
      "children",
      "women",
      "men",
    ]);
  });

  it("coerces raw form values to non-negative integers", () => {
    expect(toCount("3")).toBe(3);
    expect(toCount(2)).toBe(2);
    expect(toCount("")).toBe(0);
    expect(toCount("-1")).toBe(0);
    expect(toCount("abc")).toBe(0);
    expect(toCount(undefined)).toBe(0);
  });

  it("buildComposition emits the four canonical keys with numeric counts", () => {
    // String inputs from <input type="number"> must be normalised.
    expect(buildComposition({ infants: "1", children: "2", women: "1", men: "1" })).toEqual({
      infants: 1,
      children: 2,
      women: 1,
      men: 1,
    });
    // Missing / garbage inputs default to zero on each key.
    expect(buildComposition({})).toEqual(emptyComposition());
  });

  it("totalPassengers sums across categories and treats missing input as zero", () => {
    expect(totalPassengers({ infants: 0, children: 2, women: 1, men: 1 })).toBe(4);
    expect(totalPassengers(emptyComposition())).toBe(0);
    expect(totalPassengers(null)).toBe(0);
  });

  it("summarizePassengers renders only the non-zero categories", () => {
    expect(summarizePassengers({ infants: 0, children: 0, women: 1, men: 1 })).toEqual(
      expect.stringContaining("1 נשים")
    );
    expect(summarizePassengers({ infants: 0, children: 0, women: 1, men: 1 })).not.toEqual(
      expect.stringContaining("תינוקות")
    );
    // Nothing to summarise -> null so callers can fall back to numPeople.
    expect(summarizePassengers(emptyComposition())).toBeNull();
    expect(summarizePassengers(null)).toBeNull();
  });
});
