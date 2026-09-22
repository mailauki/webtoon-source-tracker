import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The search page: one term, two result sets, two switches.
 *
 * Three things here are regressions rather than features, and are why this
 * renders the real components instead of asserting on helpers:
 *
 *  - Typing must never unmount the field. The term used to live in `?q=` with
 *    `key={urlQuery}` on the input, so every settled keystroke swapped the
 *    focused element — which on a phone takes the keyboard down mid-word.
 *    Only real keystrokes against a real field show that; `key` is valid on
 *    any element and the remount is correct React.
 *  - The catalog card's success effect once called an inline `onAdded` closure
 *    plus `router.refresh()`. The closure had a new identity every render, so
 *    the effect re-ran, set state, re-rendered, and looped until React threw.
 *    Types and lint both pass on that shape.
 *  - The switches have to reach the request. They are the whole feature, and a
 *    dropped query param looks exactly like "MyAnimeList had nothing".
 */

const { saveLibraryPrefs, addEntry, refresh } = vi.hoisted(() => ({
  saveLibraryPrefs: vi.fn(async () => {}),
  addEntry: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));
vi.mock("@/app/actions/add-entry", () => ({ addEntry }));

// The page never navigates — the term is state, not a location — so `replace`
// is a spy that must stay unused. `refresh` is the one real call, made after
// a title is added.
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

// The library half renders real EntryCards, which pull in Link, the context
// menu and the source dialog. None of that is under test here.
vi.mock("@/components/entry-card", () => ({
  EntryCard: ({ entry }: { entry: { id: number } }) => (
    <div data-testid="entry">{entry.id}</div>
  ),
}));

// next/image needs a real loader config; a plain img is all this asserts on.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={String(props.src ?? "")} />;
  },
}));

import { CatalogResults } from "@/components/search/catalog-results";
import { LibraryResults } from "@/components/search/library-results";
import { SearchField } from "@/components/search/search-field";
import { SearchFilters } from "@/components/search/search-filters";
import { SearchPrompt } from "@/components/search/search-prompt";
import { SearchSwitches } from "@/components/search/search-switches";
import type { MediaKind } from "@/lib/data/search";
import type { LibraryRow } from "@/lib/data/entries";

/** Only the fields the search page actually reads. */
function row(
  id: number,
  title: string,
  mal_media_kind: string | null = "manhwa",
  title_en: string | null = null,
): LibraryRow {
  return {
    id,
    list_status: "reading",
    media_titles: { title, title_en, mal_media_kind },
    entry_sources: [],
  } as unknown as LibraryRow;
}

const ROWS = [
  row(1, "Solo Leveling"),
  row(2, "Omniscient Reader", "manhwa", "Omniscient Reader's Viewpoint"),
  row(3, "Tower of God"),
  row(4, "Solo Leveling", "light_novel"),
];

function setup({
  entries = ROWS,
  connected = true,
  initial = {},
  matureLocked = false,
}: {
  entries?: LibraryRow[];
  connected?: boolean;
  initial?: { includeNsfw?: boolean; mediaKind?: MediaKind };
  matureLocked?: boolean;
} = {}) {
  return render(
    <SearchFilters
      initial={initial}
      entries={entries}
      matureLocked={matureLocked}
    >
      <SearchField />
      <SearchSwitches />
      <SearchPrompt />
      <LibraryResults />
      <CatalogResults connected={connected} />
    </SearchFilters>,
  );
}

const field = () => screen.getByRole("searchbox", { name: "Search titles" });
const visibleIds = () =>
  screen.queryAllByTestId("entry").map((n) => Number(n.textContent));
const nsfwToggle = () => screen.getByRole("button", { name: /include nsfw/i });
const queryNsfwToggle = () =>
  screen.queryByRole("button", { name: /include nsfw/i });
const kindChip = (name: RegExp) =>
  screen.getByRole("button", { name });

/** The catalog result the stubbed route answers with. */
const RESULT = {
  mal_media_id: 99,
  title: "Solo Leveling: Ragnarok",
  title_en: null,
  main_picture_url: null,
  media_kind: "manhwa",
  num_chapters: 12,
};

function mockSearch(results: unknown[] = [RESULT], ok = true, status = 200) {
  // The URL is a declared argument so `lastRequest` below can read it back
  // off the call: an argument-less mock types its calls as an empty tuple. It
  // is echoed on the response the way a real one carries it.
  const fetchMock = vi.fn(async (url: RequestInfo | URL) => ({
    ok,
    status,
    url: String(url),
    json: async () => (ok ? { results } : { error: "boom" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The query string of the most recent catalog request. */
function lastRequest(fetchMock: ReturnType<typeof mockSearch>) {
  const url = String(fetchMock.mock.calls.at(-1)?.[0]);
  return new URL(url, "http://localhost").searchParams;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  saveLibraryPrefs.mockClear();
  addEntry.mockReset();
  refresh.mockClear();
  replace.mockClear();
  mockSearch();
});

describe("typing is never interrupted", () => {
  it("keeps the same input element across every keystroke", async () => {
    setup();

    const element = field();
    await userEvent.type(element, "solo leveling");

    // Holding the node across the whole word is what proves it was never
    // unmounted; the old `key={urlQuery}` shape fails right here.
    expect(field()).toBe(element);
    expect(element).toHaveValue("solo leveling");
  });

  it("keeps focus on the field while typing", async () => {
    setup();
    await userEvent.type(field(), "tower");

    // Focus surviving is what keeps the mobile keyboard up; a remount drops it.
    expect(field()).toHaveFocus();
  });

  it("never navigates, during typing or after it settles", async () => {
    setup();
    await userEvent.type(field(), "solo");

    expect(replace).not.toHaveBeenCalled();
    // Nothing lands late either: there is no debounced `?q=` write left to
    // fire, so waiting past the catalog's own debounce still finds no call.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the library half", () => {
  it("narrows on the keystroke, with no round-trip", async () => {
    setup();
    await userEvent.type(field(), "tower");

    // No navigation and no fetch needed: the rows were already in the browser.
    expect(visibleIds()).toEqual([3]);
    expect(replace).not.toHaveBeenCalled();
  });

  it("matches case-insensitively", async () => {
    setup();
    await userEvent.type(field(), "TOWER");
    expect(visibleIds()).toEqual([3]);
  });

  it("matches the English title as well as the romanised one", async () => {
    setup();
    // Only row 2's `title_en` contains "viewpoint".
    await userEvent.type(field(), "viewpoint");
    expect(visibleIds()).toEqual([2]);
  });

  it("says so plainly when the shelf has no match", async () => {
    setup();
    await userEvent.type(field(), "nonesuch");

    expect(screen.getByText(/nothing you track matches/i)).toBeInTheDocument();
    expect(visibleIds()).toEqual([]);
  });

  it("shows nothing at all until something is typed", () => {
    setup();

    expect(screen.getByText("Search for a title")).toBeInTheDocument();
    expect(screen.queryByText("In your library")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("the novels/webtoons switch", () => {
  // Rows 1 and 4 are the same title in both forms, which is the case the
  // switch exists for: searching "solo" has to return one or the other, never
  // both stacked together.
  it("shows webtoons and hides novels by default", async () => {
    setup();
    await userEvent.type(field(), "solo");
    expect(visibleIds()).toEqual([1]);
  });

  it("swaps the shelf over to novels when flipped", async () => {
    setup();
    await userEvent.click(kindChip(/^novels/i));
    await userEvent.type(field(), "solo");

    expect(visibleIds()).toEqual([4]);
  });

  it("starts on the stored side", async () => {
    setup({ initial: { mediaKind: "novels" } });
    await userEvent.type(field(), "solo");

    expect(kindChip(/^novels/i)).toHaveAttribute("aria-pressed", "true");
    expect(visibleIds()).toEqual([4]);
  });

  it("remembers the side it was moved to", async () => {
    setup();
    await userEvent.click(kindChip(/^novels/i));
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ mediaKind: "novels" });
  });

  it("asks MyAnimeList for the selected side", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "solo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastRequest(fetchMock).get("kind")).toBe("webtoons");

    await userEvent.click(kindChip(/^novels/i));
    // A switch is already settled when it is clicked, so this does not wait on
    // the debounce the way a keystroke does.
    await waitFor(() =>
      expect(lastRequest(fetchMock).get("kind")).toBe("novels"),
    );
  });
});

describe("the NSFW switch, under the age floor", () => {
  // The switch is one half of the gate. The other half is the route, which
  // ignores `nsfw=1` from an unconfirmed account however the request was
  // made — a hidden control is not a permission check.

  it("is gone entirely for an account that has not confirmed 18 or over", () => {
    setup({ matureLocked: true });

    // Absent, not disabled: a greyed-out control still advertises what it
    // withholds and invites "how do I turn this on".
    expect(queryNsfwToggle()).toBeNull();
  });

  it("leaves the other switch alone", () => {
    setup({ matureLocked: true });

    expect(kindChip(/webtoons/i)).toBeInTheDocument();
  });

  it("stays hidden even when the stored preference says include", () => {
    // A user who set this while confirmed, then had the floor apply again.
    setup({ matureLocked: true, initial: { includeNsfw: true } });

    expect(queryNsfwToggle()).toBeNull();
  });

  it("never sends nsfw=1 while hidden, whatever the stored preference", async () => {
    const fetchMock = mockSearch();
    setup({ matureLocked: true, initial: { includeNsfw: true } });

    await userEvent.type(field(), "solo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(lastRequest(fetchMock).has("nsfw")).toBe(false);
  });

  it("is present again once the account is confirmed", () => {
    setup({ matureLocked: false });

    expect(nsfwToggle()).toBeInTheDocument();
  });
});

describe("the NSFW switch", () => {
  it("is off to start with, and says nothing to the route", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "solo");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(nsfwToggle()).toHaveAttribute("aria-pressed", "false");
    // Absent rather than "0": the route reads anything but "1" as off, and
    // sending the parameter only when asked keeps that unambiguous.
    expect(lastRequest(fetchMock).has("nsfw")).toBe(false);
  });

  it("asks for adult titles once pressed", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "solo");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await userEvent.click(nsfwToggle());
    await waitFor(() => expect(lastRequest(fetchMock).get("nsfw")).toBe("1"));
    expect(nsfwToggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("starts pressed when the stored preference says so", () => {
    setup({ initial: { includeNsfw: true } });
    expect(nsfwToggle()).toHaveAttribute("aria-pressed", "true");
  });

  it("persists the choice as a boolean, not a sentinel", async () => {
    setup();
    await userEvent.click(nsfwToggle());
    expect(saveLibraryPrefs).toHaveBeenCalledWith({ includeNsfw: true });

    await userEvent.click(nsfwToggle());
    // false must survive as false — it is "hide them again", a real choice.
    expect(saveLibraryPrefs).toHaveBeenLastCalledWith({ includeNsfw: false });
  });

  // The user's own shelf is never censored, matching the sync, which pulls
  // their list with `nsfw: true`. The switch is about discovery only.
  it("does not touch the library half", async () => {
    setup();
    await userEvent.type(field(), "solo");
    expect(visibleIds()).toEqual([1]);

    await userEvent.click(nsfwToggle());
    expect(visibleIds()).toEqual([1]);
  });
});

describe("the catalog half", () => {
  it("searches on its own once the term settles, with no button to press", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "solo");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(lastRequest(fetchMock).get("q")).toBe("solo");
    // By role: the cover's placeholder carries the title as well, so a bare
    // text query matches twice.
    expect(
      await screen.findByRole("heading", { name: "Solo Leveling: Ragnarok" }),
    ).toBeInTheDocument();
  });

  // The debounce is what the old opt-in button was really buying: one request
  // for a word typed straight through, not one per character.
  it("spends one request on a word typed straight through", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "leveling");

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for MyAnimeList's own minimum before asking", async () => {
    const fetchMock = mockSearch();
    setup();
    await userEvent.type(field(), "so");

    expect(await screen.findByText(/keep typing/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers the connection instead of a failed search when there is none", async () => {
    const fetchMock = mockSearch();
    setup({ connected: false });
    await userEvent.type(field(), "solo");

    expect(
      await screen.findByRole("link", { name: /connect myanimelist/i }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the route's own error rather than blaming the network", async () => {
    mockSearch([], false, 429);
    setup();
    await userEvent.type(field(), "solo");

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("names the switch when the catalog comes back empty", async () => {
    mockSearch([]);
    setup();
    await userEvent.type(field(), "solo");

    // The result set is narrowed by the switch and by what the user already
    // has, so the copy must not claim MyAnimeList had nothing.
    expect(
      await screen.findByText(/webtoons, manga or manhwa/i),
    ).toBeInTheDocument();
  });

  it("marks a title added without looping on its own refresh", async () => {
    addEntry.mockResolvedValue({ ok: true, message: "Added", entryId: 7 });
    setup();
    await userEvent.type(field(), "solo");
    await screen.findByRole("heading", { name: "Solo Leveling: Ragnarok" });

    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    expect(await screen.findByText("Added")).toBeInTheDocument();
    // One refresh, not a render loop: the effect is guarded, so the render
    // that `refresh` itself causes must not fire it again.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
