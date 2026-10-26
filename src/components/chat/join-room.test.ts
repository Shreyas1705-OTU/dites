import { describe, expect, it } from "vitest";

import { rejoinLabel } from "./join-room";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-26T12:00:00Z");
const at = (msFromNow: number) => new Date(now + msFromNow).toISOString();

describe("rejoinLabel", () => {
  it("counts whole days, rounding up", () => {
    expect(rejoinLabel(at(5 * DAY), now)).toBe("Rejoin in 5 days");
    expect(rejoinLabel(at(4.2 * DAY), now)).toBe("Rejoin in 5 days");
    expect(rejoinLabel(at(4 * DAY), now)).toBe("Rejoin in 4 days");
    expect(rejoinLabel(at(1.5 * DAY), now)).toBe("Rejoin in 2 days");
  });

  it("says 1 day (singular) for the final day, never 0", () => {
    expect(rejoinLabel(at(0.8 * DAY), now)).toBe("Rejoin in 1 day");
    expect(rejoinLabel(at(60_000), now)).toBe("Rejoin in 1 day");
  });
});
