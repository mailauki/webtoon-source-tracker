/**
 * The label helpers must stay importable from a Server Component.
 *
 * They used to live on components/entry-card.tsx, which is "use client" — so
 * the entry page's server-rendered header crashed at render with "attempted
 * to call progressLabel() from the server". A plain import here is the check:
 * this file has no "use client", so if the helpers ever move back behind that
 * boundary, the module graph pulls React client internals in and this fails.
 */
import { describe, expect, it } from "vitest";

import { progressLabel, statusLabel } from "@/lib/data/entry-labels";

describe("entry labels are server-safe", () => {
  it("formats progress without a client boundary", () => {
    expect(progressLabel(41, 179)).toBe("41 / 179");
    // An ongoing series has no total to divide by.
    expect(progressLabel(41, null)).toBe("41 / —");
    expect(progressLabel(41, 0)).toBe("41 / —");
  });

  it("words a status, and falls back to the raw value", () => {
    expect(statusLabel("plan_to_read")).toBe("Plan to read");
    // A status MAL adds should render as itself, not as a blank.
    expect(statusLabel("rereading_forever")).toBe("rereading_forever");
  });
});
