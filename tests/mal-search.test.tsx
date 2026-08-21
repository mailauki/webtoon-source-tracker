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

const { searchParams } = vi.hoisted(() => ({
  searchParams: { current: new URLSearchParams({ q: "solo leveling" }) },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams.current,
  useRouter: () => ({ refresh }),
}));

// next/image needs a real loader config; a plain img is all this asserts on.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt="" src={String(props.src ?? "")} />;
  },
}));

import { MalSearchResults } from "@/components/mal-search-results";

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
  searchParams.current = new URLSearchParams({ q: "solo leveling" });
});

describe("MAL search panel", () => {
  it("lists results for the active query", async () => {
    mockSearch([RESULT]);
    render(<MalSearchResults />);

    expect(
      await screen.findByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("renders nothing until the query is long enough", () => {
    mockSearch([RESULT]);
    searchParams.current = new URLSearchParams({ q: "so" });
    const { container } = render(<MalSearchResults />);

    expect(container).toBeEmptyDOMElement();
  });

  it("offers no add button for a title already in the library", async () => {
    mockSearch([{ ...RESULT, in_library: true }]);
    render(<MalSearchResults />);

    expect(await screen.findByText("In library")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Solo Leveling" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
  });

  it("surfaces a server error instead of failing silently", async () => {
    mockSearch([], false, 500);
    render(<MalSearchResults />);

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

    render(<MalSearchResults />);
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
