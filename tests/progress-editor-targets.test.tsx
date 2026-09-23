import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { updateProgress } = vi.hoisted(() => ({ updateProgress: vi.fn() }));
vi.mock("@/app/actions/progress", () => ({ updateProgress }));

import { ProgressEditor } from "@/components/progress-editor";
import type { EntryDetail } from "@/lib/data/entries";

/**
 * What the progress editor promises about where a save goes.
 *
 * The label used to be derived from `mal_media_id` alone, which ignored both
 * sync flags — so a title excluded from MyAnimeList still offered "Save to
 * MyAnimeList" while the action wrote it to AniList only. One row in this
 * database was in exactly that state. A button that names the wrong service is
 * worse than a vague one: it is the only thing telling the user what an edit
 * will do to lists the app does not own.
 */

afterEach(cleanup);

function entry(over: {
  mal?: number | null;
  anilist?: number | null;
  syncMal?: boolean;
  syncAniList?: boolean;
}): EntryDetail {
  return {
    id: 1,
    list_status: "reading",
    num_chapters_read: 3,
    num_volumes_read: 0,
    score: 0,
    is_rereading: false,
    sync_to_mal: over.syncMal ?? true,
    sync_to_anilist: over.syncAniList ?? true,
    media_titles: {
      id: 10,
      mal_media_id: over.mal === undefined ? 121496 : over.mal,
      anilist_media_id: over.anilist === undefined ? 105398 : over.anilist,
      num_chapters: 100,
    },
  } as unknown as EntryDetail;
}

const button = () => screen.getByRole("button", { name: /^Save/ });

describe("ProgressEditor names the services a save reaches", () => {
  it("names both when both are live", () => {
    render(<ProgressEditor entry={entry({})} />);
    expect(button()).toHaveTextContent("Save to MyAnimeList and AniList");
  });

  // The live mismatch: on both sites, but excluded from MyAnimeList.
  it("drops a site the title is excluded from", () => {
    render(<ProgressEditor entry={entry({ syncMal: false })} />);
    expect(button()).toHaveTextContent("Save to AniList");
    expect(button()).not.toHaveTextContent("MyAnimeList");
  });

  it("drops a site that does not have the title", () => {
    render(<ProgressEditor entry={entry({ anilist: null })} />);
    expect(button()).toHaveTextContent("Save to MyAnimeList");
  });

  it("promises nothing when both sides are paused", () => {
    // Still saveable — the action keeps the edit locally — so the button works
    // but must not claim a service.
    render(
      <ProgressEditor entry={entry({ syncMal: false, syncAniList: false })} />,
    );
    expect(button()).toHaveTextContent("Save");
    expect(button()).not.toBeDisabled();
    expect(screen.getByText(/your library only/)).toBeInTheDocument();
  });

  it("disables the form when the edit has nowhere to go", () => {
    // AniList-only and AniList switched off: the action refuses this, so the
    // form says so rather than letting a chapter number be typed first.
    render(
      <ProgressEditor entry={entry({ mal: null, syncAniList: false })} />,
    );
    expect(button()).toBeDisabled();
    expect(screen.getByRole("button", { name: /one chapter forward/i })).toBeDisabled();
    expect(screen.getByText(/nowhere to record progress/i)).toBeInTheDocument();
  });
});
