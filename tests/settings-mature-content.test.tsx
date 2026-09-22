import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The switch imports the action module, which reaches server-only code.
const { saveLibraryPrefs } = vi.hoisted(() => ({
  saveLibraryPrefs:
    vi.fn<(patch: Record<string, unknown>) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/library-prefs", () => ({ saveLibraryPrefs }));

import { MatureContent } from "@/components/settings/mature-content";

afterEach(() => {
  cleanup();
  saveLibraryPrefs.mockClear();
});

const control = () => screen.getByRole("button");

describe("<MatureContent>", () => {
  it("starts from the stored preference", () => {
    render(<MatureContent initialHidden={false} />);

    expect(control()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Adult titles are shown")).toBeInTheDocument();
  });

  it("starts pressed for a user who has already hidden them", () => {
    render(<MatureContent initialHidden={true} />);

    expect(control()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Adult titles are hidden")).toBeInTheDocument();
  });

  it("saves hideNsfw when switched on", async () => {
    render(<MatureContent initialHidden={false} />);

    await userEvent.click(control());

    await waitFor(() =>
      expect(saveLibraryPrefs).toHaveBeenCalledWith({ hideNsfw: true }),
    );
    expect(control()).toHaveAttribute("aria-pressed", "true");
  });

  it("saves the explicit false when switched back off", async () => {
    render(<MatureContent initialHidden={true} />);

    await userEvent.click(control());

    // Not an absent key: "show them again" is a choice, and the column
    // defaults the other way for a user who has never touched it.
    await waitFor(() =>
      expect(saveLibraryPrefs).toHaveBeenCalledWith({ hideNsfw: false }),
    );
    expect(control()).toHaveAttribute("aria-pressed", "false");
  });

  it("says what the switch will do, not just where it is", async () => {
    render(<MatureContent initialHidden={false} />);

    expect(control()).toHaveTextContent("Hide");
    await userEvent.click(control());
    expect(control()).toHaveTextContent("Show");
  });

  it("locks the switch for an account that has not confirmed it is 18+", async () => {
    render(<MatureContent initialHidden={false} locked />);

    // Reads as hidden even though the stored preference is "show": while the
    // age floor applies, the preference makes no difference to what renders,
    // so the copy must not claim otherwise.
    expect(control()).toBeDisabled();
    expect(control()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Adult titles are hidden")).toBeInTheDocument();
    expect(
      screen.getByText("Confirm you are 18 or over above to change this."),
    ).toBeInTheDocument();
  });

  it("writes nothing while locked", async () => {
    render(<MatureContent initialHidden={false} locked />);

    await userEvent.click(control());

    expect(saveLibraryPrefs).not.toHaveBeenCalled();
  });

  it("does not send the search page's own preference", async () => {
    render(<MatureContent initialHidden={false} />);

    await userEvent.click(control());

    await waitFor(() => expect(saveLibraryPrefs).toHaveBeenCalled());
    // `includeNsfw` widens what /search asks MyAnimeList for and is a
    // different setting; this switch must never write it.
    expect(saveLibraryPrefs.mock.calls[0][0]).not.toHaveProperty("includeNsfw");
  });
});
