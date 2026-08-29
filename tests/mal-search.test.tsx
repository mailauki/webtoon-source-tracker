import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for the "Add from MyAnimeList" panel.
 *
 * The bug this exists for: MalResultCard's success effect called an inline
 * `onAdded` closure and `router.refresh()`. The closure had a fresh identity
 * every render, so the effect re-ran, set state, re-rendered the parent, and
 * looped until React threw "Maximum update depth exceeded".
 *
 * Types and lint both pass on that shape, and the RSC boundary guard cannot
 * see it either — it is a runtime identity problem, not a static one. Only
 * actually rendering the component catches it, which is what this does.
 */

const { addEntry, refresh } = vi.hoisted(() => ({
  addEntry: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/app/actions/add-entry", () => ({ addEntry }));

// <LibraryFilters> saves chip changes through this. It is a Server Action
// reaching the server-only DAL, which cannot be imported into a client test.
vi.mock("@/app/actions/library-prefs", () => ({
  saveLibraryPrefs: vi.fn(async () => {}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

// The panel takes its term from <LibraryFilters> state, not from `?q=` — and
// that state has no seed any more, so these render the real header field
// alongside the panel and type the term in, the way a user sets it.
vi.mock("@/components/entry-card", () => ({
  EntryCard: () => null,
}));

// next/image needs a real loader config; a plain img is all this asserts on.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={String(props.src ?? "")} />;
  },
}));

import { HeaderSearch } from "@/components/header-search";
import { LibraryFilters } from "@/components/library-grid";
import { MalSearchResults } from "@/components/mal-search-results";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";

/**
 * Renders the panel and types `q` into the header field.
 *
 * Async because the term only exists once the keystrokes land — there is no
 * initial query to render with. The panel mounts empty and appears when the
 * query passes the minimum length, exactly as it does in the app.
 *
 * Stops at the button: the catalog is opt-in now, so typing alone gets you the
 * offer to search MAL, not the results. Use `openPanel` to go the rest of the
 * way.
 */
async function renderPanel(q = "solo leveling") {
  const result = render(
    <LibraryFilters initial={{ status: "", source: "", sort: DEFAULT_SORT }}>
      <HeaderSearch />
      <MalSearchResults />
    </LibraryFilters>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Search titles" }));
  await userEvent.type(
    screen.getByRole("searchbox", { name: "Search titles" }),
    q,
  );
  return result;
}

/** Presses the opt-in button, which is what actually issues the MAL request. */
async function openPanel() {
  await userEvent.click(
    screen.getByRole("button", { name: /search myanimelist/i }),
  );
}

/** Renders, types, and opens the catalog panel — the full path to results. */
async function renderOpenPanel(q = "solo leveling") {
  const result = await renderPanel(q);
  await openPanel();
  return result;
}

const RESULT = {
  mal_media_id: 1,
  title: "Solo Leveling",
  title_en: null,
  main_picture_url: null,
  media_kind: "manhwa",
  num_chapters: 179,
};

function mockSearch(results: unknown[], ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      json: async () => (ok ? { results } : { error: "boom" }),
    })),
  );
}

afterEach(cleanup);
beforeEach(() => {
  addEntry.mockReset();
  refresh.mockReset();
});

describe("MAL search panel", () => {
  it("lists results once the catalog search is asked for", async () => {
    mockSearch([RESULT]);
    await renderOpenPanel();

    expect(
      await screen.findByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  /**
   * The point of the button: typing narrows the shelf and nothing else. A
   * search that never leaves the library must not spend a MAL request.
   */
  it("searches nothing until the button is pressed", async () => {
    mockSearch([RESULT]);
    await renderPanel();

    expect(
      screen.getByRole("button", { name: /search myanimelist/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Add from MyAnimeList" }),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders nothing until the query is long enough", async () => {
    mockSearch([RESULT]);
    await renderPanel("so");

    // The header field is on screen, but not even the button below it: two
    // characters is under the minimum, so there is nothing to offer to search.
    expect(
      screen.queryByRole("button", { name: /search myanimelist/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Add from MyAnimeList" }),
    ).toBeNull();
  });

  /**
   * Editing the term drops back to the button. Results belong to the term they
   * were fetched for, so they must not sit under a different one.
   */
  it("closes the panel again when the query changes", async () => {
    mockSearch([RESULT]);
    await renderOpenPanel();
    expect(
      await screen.findByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search titles" }),
      " x",
    );

    expect(
      screen.queryByRole("heading", { name: "Add from MyAnimeList" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /search myanimelist/i }),
    ).toBeInTheDocument();
  });

  /**
   * The route drops owned titles from the response, so the panel never has an
   * "in library" row to render — an empty result set is the whole signal.
   */
  it("says so when the catalog has nothing new to add", async () => {
    mockSearch([]);
    await renderOpenPanel();

    expect(
      await screen.findByText(/nothing new on myanimelist matches/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^add$/i })).toBeNull();
  });

  it("surfaces a server error instead of failing silently", async () => {
    mockSearch([], false, 500);
    await renderOpenPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  /**
   * The actual regression. Before the fix this render loops until React throws
   * "Maximum update depth exceeded"; `refresh` is called hundreds of times
   * rather than once.
   */
  it("settles after a successful add instead of looping", async () => {
    mockSearch([RESULT]);
    addEntry.mockResolvedValue({
      ok: true,
      entryId: 7,
      message: "Added Solo Leveling to your list.",
    });

    await renderOpenPanel();
    await userEvent.click(
      await screen.findByRole("button", { name: /^add$/i }),
    );

    // The card flips to "Added" once the add succeeds.
    expect(await screen.findByText("Added")).toBeInTheDocument();

    // The real assertion: the success effect runs exactly once. A re-render
    // loop shows up here as a rapidly climbing call count.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const settled = refresh.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(refresh.mock.calls.length).toBe(settled);
  });
});
