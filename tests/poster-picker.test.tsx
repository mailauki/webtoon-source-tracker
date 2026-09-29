import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/entry-cover", () => ({
  setEntryCover: vi.fn(async () => ({ ok: true, message: "Poster updated." })),
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { setEntryCover } from "@/app/actions/entry-cover";
import { PosterPicker } from "@/components/poster-picker";
import { posterOptions } from "@/lib/data/entry-cover";

const CATALOG = "https://cdn.myanimelist.net/a.jpg";
const MAL_ALT = "https://cdn.myanimelist.net/b.jpg";
const ANILIST = "https://s4.anilist.co/c.jpg";
const BANNER = "https://s4.anilist.co/banner.jpg";

afterEach(cleanup);

function renderPicker(current: string | null = null, isPro = true) {
  render(
    <PosterPicker
      entryId={7}
      title="Tower of God"
      catalog={CATALOG}
      current={current}
      isPro={isPro}
      options={posterOptions({
        catalog: CATALOG,
        current,
        myanimelist: [CATALOG, MAL_ALT],
        anilist: [ANILIST],
        anilistBanner: BANNER,
      })}
    />,
  );
}

/** The value the form will post, from its hidden field. */
function postedCover() {
  return (document.querySelector('input[name="cover_url"]') as HTMLInputElement)
    .value;
}

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /change poster/i }));
  return user;
}

describe("PosterPicker", () => {
  it("offers the default, each site's posters, and a link", async () => {
    renderPicker();
    await open();

    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Default",
      "MyAnimeList",
      "AniList",
      "AniList banner",
      "Your link",
    ]);
    // Nothing is saved yet, so the default is the choice and there is
    // nothing to save.
    expect(screen.getByRole("radio", { name: "Default" })).toBeChecked();
    expect(screen.queryByRole("button", { name: /save poster/i })).toBeNull();
  });

  it("posts the chosen poster's URL", async () => {
    renderPicker();
    const user = await open();

    await user.click(screen.getByRole("radio", { name: "AniList" }));
    expect(postedCover()).toBe(ANILIST);
    await user.click(screen.getByRole("radio", { name: "AniList banner" }));
    expect(postedCover()).toBe(BANNER);
    expect(screen.getByRole("button", { name: /save poster/i })).toBeVisible();
  });

  it("posts a reset, not the catalog URL, for the default", async () => {
    renderPicker(MAL_ALT);
    const user = await open();

    expect(screen.getByRole("radio", { name: /myanimelist/i })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Default" }));
    expect(postedCover()).toBe("");
  });

  it("switches to the link when one is typed, and only saves an https one", async () => {
    renderPicker();
    const user = await open();

    const field = screen.getByLabelText("Image link");
    await user.type(field, "http://example.test/x.png");
    expect(screen.getByRole("radio", { name: "Your link" })).toBeChecked();
    expect(screen.queryByRole("button", { name: /save poster/i })).toBeNull();

    await user.clear(field);
    await user.type(field, "https://example.test/x.png");
    expect(postedCover()).toBe("https://example.test/x.png");
    expect(screen.getByRole("button", { name: /save poster/i })).toBeVisible();
  });

  it("saves the choice and closes", async () => {
    renderPicker();
    const user = await open();

    await user.click(screen.getByRole("radio", { name: "AniList" }));
    await user.click(screen.getByRole("button", { name: /save poster/i }));

    const [, formData] = vi.mocked(setEntryCover).mock.calls.at(-1)!;
    expect(formData.get("entry_id")).toBe("7");
    expect(formData.get("cover_url")).toBe(ANILIST);
    expect(await screen.findByRole("button", { name: /change poster/i })).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PosterPicker without Pro", () => {
  it("offers Get Pro instead of the posters", async () => {
    renderPicker(null, false);
    await open();

    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryByLabelText("Image link")).toBeNull();
    expect(screen.getByRole("link", { name: /get pro/i })).toHaveAttribute(
      "href",
      "/pro",
    );
    // Nothing chosen, so nothing to reset.
    expect(screen.queryByRole("button", { name: /reset/i })).toBeNull();
  });

  it("can still go back to the default after losing Pro", async () => {
    renderPicker(MAL_ALT, false);
    const user = await open();

    await user.click(screen.getByRole("button", { name: /reset to default/i }));

    const [, formData] = vi.mocked(setEntryCover).mock.calls.at(-1)!;
    expect(formData.get("cover_url")).toBe("");
  });
});
