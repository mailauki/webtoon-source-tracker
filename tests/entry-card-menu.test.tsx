import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above every const, so the spy has to be hoisted with it.
const { updateProgress } = vi.hoisted(() => ({
  updateProgress: vi.fn<
    (prev: unknown, formData: FormData) => Promise<ProgressState>
  >(async () => ({ ok: true, message: "Saved" })),
}));
vi.mock("@/app/actions/progress", () => ({ updateProgress }));

// The dialog imports these actions, which reach through to server-only code.
const { addEntrySource } = vi.hoisted(() => ({
  addEntrySource: vi.fn<
    (
      prev: unknown,
      formData: FormData,
    ) => Promise<{ error?: string; message?: string } | null>
  >(async () => ({ message: "Source added." })),
}));
vi.mock("@/app/actions/entry-sources", () => ({
  addEntrySource,
  updateEntrySource: vi.fn(async () => ({ message: "Source updated." })),
  removeEntrySource: vi.fn(async () => ({ message: "Source removed." })),
}));


const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: vi.fn() },
}));

import type { ProgressState } from "@/app/actions/progress";
import { EntryCard } from "@/components/entry-card";
import {
  addableSources,
  nextStatus,
  quickAddSource,
} from "@/components/entry-card-menu";
import type { LibraryRow } from "@/lib/data/entries";
import { linkableSources } from "@/lib/data/source-links";

function row(overrides: Partial<LibraryRow> = {}): LibraryRow {
  return {
    id: 7,
    list_status: "reading",
    num_chapters_read: 41,
    entry_sources: [],
    media_titles: {
      id: 500,
      title: "Tower of God",
      num_chapters: 179,
      main_picture_url: null,
    },
    ...overrides,
  } as unknown as LibraryRow;
}

const TOP_SOURCES = [
  { id: 1, name: "Tapas", count: 9 },
  { id: 2, name: "Webtoon", count: 4 },
];

/** The cover: a plain link to the entry page, and the menu's trigger. */
function cardTrigger() {
  return screen.getByRole("link", { name: /^Tower of God$/ });
}

/** The touch-only overflow button that opens the sheet. */
function sheetButton() {
  return screen.getByRole("button", { name: /^Actions for/ });
}

/**
 * Radix opens a context menu on a real `contextmenu` event, which userEvent
 * produces from a right-click. This is the mouse surface.
 */
async function openMenu(entry: LibraryRow = row()) {
  const user = userEvent.setup();
  render(<EntryCard entry={entry} topSources={TOP_SOURCES} />);
  await user.pointer({ keys: "[MouseRight]", target: cardTrigger() });
  return user;
}

/** The same actions, reached the way a phone reaches them. */
async function openSheet(entry: LibraryRow = row()) {
  const user = userEvent.setup();
  render(<EntryCard entry={entry} topSources={TOP_SOURCES} />);
  await user.click(sheetButton());
  return user;
}

afterEach(() => {
  cleanup();
  // `restoreMocks` restores spies but leaves vi.fn() call history intact.
  updateProgress.mockClear();
  toastError.mockClear();
});

describe("entry card quick-access menu", () => {
  it("stays closed until the card is tapped", () => {
    render(<EntryCard entry={row()} />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens a menu when the card is tapped", async () => {
    await openMenu();
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  /**
   * The scroll bug this guards.
   *
   * Radix's trigger opens from `pointerdown`, which on touch fires the moment
   * a finger lands — before the browser knows a swipe from a tap. Scrolling
   * the shelf opened a menu under the thumb on nearly every swipe.
   *
   * Opening moved to `click`, which a touch that turns into a scroll never
   * produces. A bare pointer-down must therefore leave the menu shut.
   */
  it("stays shut on pointer-down alone, so a swipe can scroll past", () => {
    render(<EntryCard entry={row()} topSources={TOP_SOURCES} />);

    fireEvent.pointerDown(cardTrigger(), { button: 0, ctrlKey: false });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // The same gesture end to end: press the card, drag away, release. No click
  // is produced, so nothing opens.
  it("stays shut when a press on a card is dragged away and released", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={row()} topSources={TOP_SOURCES} />);

    await user.pointer([
      { keys: "[MouseLeft>]", target: cardTrigger() },
      { target: document.body },
      { keys: "[/MouseLeft]" },
    ]);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  /**
   * A keyboard has no right-click, so the actions reach it through the same
   * overflow button touch uses. It is `sr-only` on a fine pointer rather than
   * hidden, which keeps it in the tab order — a `hidden` button would leave
   * Shift+F10 as the only way in.
   *
   * jsdom applies no CSS, so what this can assert is that the button is in the
   * document, focusable and operable; the media-query gating is checked
   * against the built stylesheet instead.
   */
  it("reaches the actions from the keyboard, through the overflow button", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={row()} topSources={TOP_SOURCES} />);

    sheetButton().focus();
    expect(sheetButton()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("is a plain link to the entry page", () => {
    render(<EntryCard entry={row()} />);

    // Nothing is intercepted: the card navigates, and the menu is the
    // secondary gesture on top of it.
    expect(cardTrigger()).toHaveAttribute("href", "/entry/7");
    expect(cardTrigger()).not.toHaveAttribute("aria-haspopup");
  });

  /**
   * Watches whether the navigation survives a click.
   *
   * Listens on `document`, not on the element: React delegates to the root
   * container, so a listener bound to the anchor itself runs *before* the
   * onClick handler under test and would always see an uncancelled event.
   */
  function watchNavigation() {
    const seen: boolean[] = [];
    const onClick = (e: Event) => seen.push(e.defaultPrevented);
    document.addEventListener("click", onClick);
    return {
      get prevented() {
        return seen.at(-1) ?? null;
      },
      stop: () => document.removeEventListener("click", onClick),
    };
  }

  // The card navigates again. A left click must reach the entry page and must
  // not raise a menu on the way.
  it("navigates on a plain click, without opening a menu", async () => {
    const user = userEvent.setup();
    render(<EntryCard entry={row()} />);
    const nav = watchNavigation();

    await user.click(cardTrigger());

    expect(nav.prevented).toBe(false);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    nav.stop();
  });

  // The whole point of keeping the href: these gestures must reach the
  // browser, with no menu opening over the top of them.
  it.each([
    ["cmd", "{Meta>}", "{/Meta}"],
    ["shift", "{Shift>}", "{/Shift}"],
  ])("leaves a %s-click to the browser", async (_name, down, up) => {
    const user = userEvent.setup();
    render(<EntryCard entry={row()} />);
    const nav = watchNavigation();

    await user.keyboard(down);
    await user.click(cardTrigger());
    await user.keyboard(up);

    expect(nav.prevented).toBe(false);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    nav.stop();
  });

  // The destination the tap used to have is the menu's first item, so nothing
  // became unreachable — it just moved one tap further in.
  it("keeps the entry page one tap away, as a real link", async () => {
    await openMenu();

    const item = await screen.findByRole("menuitem", { name: /Go to entry/ });
    expect(item).toHaveAttribute("href", "/entry/7");
  });

  it("submits one more chapter than the entry has read", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    expect(updateProgress).toHaveBeenCalledOnce();
    const formData = updateProgress.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("num_chapters_read")).toBe("42");
  });

  it("disables Add 1 chapter once every chapter is read", async () => {
    await openMenu(row({ num_chapters_read: 179 }));

    expect(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("allows Add 1 chapter on an ongoing series with no known total", async () => {
    await openMenu(
      row({
        num_chapters_read: 500,
        media_titles: {
          title: "Tower of God",
          num_chapters: null,
          main_picture_url: null,
        },
      } as unknown as Partial<LibraryRow>),
    );

    expect(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers completing a title that is being read", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark as completed" }),
    );

    expect(updateProgress).toHaveBeenCalledOnce();
    const formData = updateProgress.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("list_status")).toBe("completed");
  });

  it("offers re-reading a title that is already completed", async () => {
    const user = await openMenu(row({ list_status: "completed" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark as reading" }),
    );

    expect(updateProgress.mock.calls[0][1].get("list_status")).toBe("reading");
  });

  it("shows only one status move, not the full list", async () => {
    await openMenu();

    await screen.findByRole("menuitem", { name: "Mark as completed" });
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Plan to read" }),
    ).not.toBeInTheDocument();
  });

  it("surfaces a failed save as a toast instead of silently dropping it", async () => {
    updateProgress.mockResolvedValueOnce({
      ok: false,
      error: "MyAnimeList rejected the update",
    } as never);

    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "MyAnimeList rejected the update",
      ),
    );
  });

  it("does not toast an error when the save succeeds", async () => {
    const user = await openMenu();
    await user.click(
      await screen.findByRole("menuitem", { name: /Add 1 chapter/ }),
    );

    await vi.waitFor(() => expect(updateProgress).toHaveBeenCalledOnce());
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("source shortcuts", () => {
  it("offers every top source when the entry has none attached", () => {
    expect(addableSources([], TOP_SOURCES).map((s) => s.name)).toEqual([
      "Tapas",
      "Webtoon",
    ]);
  });

  it("does not offer a source the entry already has", () => {
    const attached = [{ sources: { id: 1 } }];

    expect(addableSources(attached, TOP_SOURCES).map((s) => s.name)).toEqual([
      "Webtoon",
    ]);
  });

  it("offers nothing once every top source is attached", () => {
    const attached = [{ sources: { id: 1 } }, { sources: { id: 2 } }];
    expect(addableSources(attached, TOP_SOURCES)).toEqual([]);
  });

  // A source row that failed to join must not knock out a real shortcut.
  it("ignores attachments whose source did not join", () => {
    expect(addableSources([{ sources: null }], TOP_SOURCES)).toHaveLength(2);
  });

  it("attaches a source with no url, leaving the details for later", async () => {
    await quickAddSource({ id: 7 }, 2);

    expect(addEntrySource).toHaveBeenCalledOnce();
    const formData = addEntrySource.mock.calls[0][1];
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("source_id")).toBe("2");
    expect(formData.get("url")).toBeNull();
  });
});

describe("go-to shortcuts", () => {
  const withSource = (url: string | null) =>
    row({
      entry_sources: [
        { id: 3, url, is_primary: true, sources: { id: 1, name: "Tapas" } },
      ],
    } as unknown as Partial<LibraryRow>);

  it("always offers the in-app entry page", async () => {
    await openMenu();

    const link = await screen.findByRole("menuitem", { name: "Go to entry" });
    expect(link).toHaveAttribute("href", "/entry/7");
  });

  it("links an attached source that has a url", async () => {
    await openMenu(withSource("https://tapas.io/series/tog"));

    const link = await screen.findByRole("menuitem", { name: "Go to Tapas" });
    expect(link).toHaveAttribute("href", "https://tapas.io/series/tog");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("hides a source quick-added without a url", async () => {
    await openMenu(withSource(null));

    await screen.findByRole("menuitem", { name: "Go to entry" });
    expect(
      screen.queryByRole("menuitem", { name: "Go to Tapas" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a url-less source reachable for editing", async () => {
    await openMenu(withSource(null));

    expect(
      await screen.findByRole("menuitem", { name: "Edit Tapas" }),
    ).toBeInTheDocument();
  });

  it("drops sources whose url is only whitespace", () => {
    const attached = [
      { id: 1, url: "   ", sources: { id: 1, name: "Tapas" } },
      { id: 2, url: "https://x.test", sources: { id: 2, name: "Webtoon" } },
    ] as unknown as LibraryRow["entry_sources"];

    expect(linkableSources(attached).map((es) => es.id)).toEqual([2]);
  });

  it("drops an attachment whose source did not join", () => {
    const attached = [
      { id: 1, url: "https://x.test", sources: null },
    ] as unknown as LibraryRow["entry_sources"];

    expect(linkableSources(attached)).toEqual([]);
  });
});

describe("nextStatus", () => {
  it("moves a title being read to completed", () => {
    expect(nextStatus("reading")).toEqual({
      value: "completed",
      label: "Mark as completed",
    });
  });

  it("offers a re-read once completed", () => {
    expect(nextStatus("completed")?.value).toBe("reading");
  });

  it.each(["on_hold", "dropped", "plan_to_read"])(
    "resumes reading from %s",
    (status) => {
      expect(nextStatus(status)).toEqual({
        value: "reading",
        label: "Start reading",
      });
    },
  );

  it("offers nothing for a status it does not know", () => {
    expect(nextStatus("something_else")).toBeNull();
  });
});

/**
 * The touch surface: the same actions, in a sheet rather than a popup.
 *
 * These assert the sheet carries and performs the identical list, since the
 * two surfaces render from one `useEntryCardActions` and the failure mode
 * worth guarding is them drifting apart.
 */
describe("the actions sheet", () => {
  it("does not exist until the overflow button is pressed", () => {
    render(<EntryCard entry={row()} topSources={TOP_SOURCES} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens from the overflow button", async () => {
    await openSheet();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("names the card it belongs to", async () => {
    await openSheet();
    expect(
      await screen.findByRole("heading", { name: "Tower of God" }),
    ).toBeInTheDocument();
  });

  // The whole reason the action list is described once and rendered twice.
  it("carries the same actions the context menu does", async () => {
    const entry = row({
      entry_sources: [
        {
          id: 3,
          url: "https://tapas.io/x",
          is_primary: true,
          sources: { id: 1, name: "Tapas" },
        },
      ],
    } as Partial<LibraryRow>);

    await openMenu(entry);
    const fromMenu = screen
      .getAllByRole("menuitem")
      .map((n) => n.textContent?.trim());
    cleanup();

    await openSheet(entry);
    const sheet = await screen.findByRole("dialog");
    const fromSheet = [
      ...sheet.querySelectorAll("button[type='button'], a"),
    ].map((n) => n.textContent?.trim());

    expect(fromSheet).toEqual(fromMenu);
  });

  it("submits a chapter from the sheet", async () => {
    const user = await openSheet();

    await user.click(await screen.findByRole("button", { name: /Add 1 chapter/ }));

    await vi.waitFor(() => expect(updateProgress).toHaveBeenCalled());
    const formData = updateProgress.mock.calls[0][1];
    expect(formData.get("num_chapters_read")).toBe("42");
  });

  it("closes once an action is taken, rather than sitting over the shelf", async () => {
    const user = await openSheet();

    await user.click(await screen.findByRole("button", { name: /Add 1 chapter/ }));

    await vi.waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("keeps the entry page reachable as a real link", async () => {
    await openSheet();
    const sheet = await screen.findByRole("dialog");

    expect(
      within(sheet).getByRole("link", { name: /Go to entry/ }),
    ).toHaveAttribute("href", "/entry/7");
  });

  it("disables Add 1 chapter at the end of a finished series", async () => {
    await openSheet(row({ num_chapters_read: 179 } as Partial<LibraryRow>));

    expect(
      await screen.findByRole("button", { name: /Add 1 chapter/ }),
    ).toBeDisabled();
  });
});
