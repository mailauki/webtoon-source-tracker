import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EntrySyncStatus } from "@/components/entry-sync-status";

/**
 * What the entry page says about where a title is tracked.
 *
 * Two facts per site, and neither implies the other: whether that service has
 * the title at all, and whether progress still travels there. The page used to
 * show only links, which answered the first and left the second invisible — so
 * a title excluded from a site, or removed from it while kept locally, looked
 * identical to one syncing normally.
 *
 * The four cases below are the ones that actually occur in this database:
 * 1,097 rows on both and syncing, 26 on MyAnimeList only, 1 on AniList only,
 * and 1 on both with MyAnimeList paused.
 */

afterEach(cleanup);

const props = {
  malMediaId: 121496 as number | null,
  anilistMediaId: 105398 as number | null,
  syncToMal: true,
  syncToAniList: true,
  archived: false,
};

/** The row for one site, so assertions cannot pick up the other's text. */
function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText(name) !== null);
  if (!row) throw new Error(`No row found for ${name}`);
  return row;
}

describe("EntrySyncStatus", () => {
  it("links both sites and says they are syncing", () => {
    render(<EntrySyncStatus {...props} />);

    expect(screen.getByRole("link", { name: /MyAnimeList/ })).toHaveAttribute(
      "href",
      "https://myanimelist.net/manga/121496",
    );
    expect(screen.getByRole("link", { name: /AniList/ })).toHaveAttribute(
      "href",
      "https://anilist.co/manga/105398",
    );
    expect(screen.getAllByText("Syncing")).toHaveLength(2);
  });

  it("says when a site simply does not have the title", () => {
    // The AniList-only case: no MyAnimeList page exists to link to, and a URL
    // built from a null id would 404.
    render(<EntrySyncStatus {...props} malMediaId={null} />);

    expect(
      screen.queryByRole("link", { name: /MyAnimeList/ }),
    ).not.toBeInTheDocument();
    expect(within(rowFor("MyAnimeList")).getByText("Not on this site")).toBeInTheDocument();
    expect(within(rowFor("AniList")).getByText("Syncing")).toBeInTheDocument();
  });

  it("distinguishes a paused site from a missing one", () => {
    // The state a removal-from-MAL leaves behind: still on the list, still
    // linked, but progress no longer travels there.
    render(<EntrySyncStatus {...props} syncToMal={false} />);

    expect(screen.getByRole("link", { name: /MyAnimeList/ })).toBeInTheDocument();
    expect(within(rowFor("MyAnimeList")).getByText("Not syncing")).toBeInTheDocument();
    expect(within(rowFor("AniList")).getByText("Syncing")).toBeInTheDocument();
  });

  it("reports an archived title as paused everywhere, whatever its flags say", () => {
    // Otherwise the row would claim to be syncing while the entry is off the
    // shelf and every sync path skips it.
    render(<EntrySyncStatus {...props} archived />);

    expect(screen.getByText("Removed from your library")).toBeInTheDocument();
    expect(screen.getAllByText("Paused")).toHaveLength(2);
    expect(screen.queryByText("Syncing")).not.toBeInTheDocument();
  });
});
