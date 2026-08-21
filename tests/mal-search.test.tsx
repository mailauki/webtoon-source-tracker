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
  useRouter: () => ({ refresh, replace: vi.fn() }),
}));

// The panel takes its term from <LibraryFilters> state now, not from `?q=`,
// so these render it inside the real provider and seed the query there.
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

import { LibraryFilters } from "@/components/library-grid";
import { MalSearchResults } from "@/components/mal-search-results";
import { DEFAULT_SORT } from "@/lib/data/library-prefs";

/** Renders the panel with `q` as the active search term. */
function renderPanel(q = "solo leveling") {
  return render(
    <LibraryFilters
      initial={{ status: "", source: "", sort: DEFAULT_SORT }}
      initialQuery={q}
    >
      <MalSearchResults />
    </LibraryFilters>,
  );
}

const RESULT = {
  mal_media_id: 1,
  title: "Solo Leveling",
  title_en: null,
  main_picture_url: null,
  media_kind: "manhwa",
  num_chapters: 179,
  in_library: false,
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
  it("lists results for the active query", async () => {
    mockSearch([RESULT]);
    renderPanel();

    expect(
      await screen.findByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders nothing until the query is long enough", () => {
    mockSearch([RESULT]);
    const { container } = renderPanel("so");

    expect(container).toBeEmptyDOMElement();
  });

  it("offers no add button for a title already in the library", async () => {
    mockSearch([{ ...RESULT, in_library: true }]);
    renderPanel();

    expect(await screen.findByText("In library")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  it("surfaces a server error instead of failing silently", async () => {
    mockSearch([], false, 500);
    renderPanel();

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

    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /add/i }));

    // The card flips to "In library" once the add succeeds.
    expect(await screen.findByText("In library")).toBeInTheDocument();

    // The real assertion: the success effect runs exactly once. A re-render
    // loop shows up here as a rapidly climbing call count.
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    const settled = refresh.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(refresh.mock.calls.length).toBe(settled);
  });
});
