import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// Deliberately NOT mocking next/image, unlike the suites that merely render a
// card containing one: what half of this file asserts is the URL next/image
// actually emits, and a stub would assert nothing.
import { CoverImage } from "@/components/cover-image";

const COVER = "https://cdn.myanimelist.net/images/manga/3/222295l.jpg";

afterEach(cleanup);

describe("CoverImage", () => {
  it("serves the cover straight from the source CDN", () => {
    render(<CoverImage src={COVER} title="Tower of God" sizes="130px" />);

    const img = screen.getByRole("presentation");

    // The whole point of `unoptimized`. A src through /_next/image is a src
    // that answers 402 once the plan's transformation allowance is gone —
    // which is the bug this component exists to keep out of the shelf.
    expect(img).toHaveAttribute("src", COVER);
    expect(img.getAttribute("src")).not.toContain("/_next/image");
    // No srcset either: every entry in one would route through the optimizer.
    expect(img).not.toHaveAttribute("srcset");
  });

  it("swaps in the title when the cover fails to load", () => {
    render(<CoverImage src={COVER} title="Tower of God" sizes="130px" />);

    fireEvent.error(screen.getByRole("presentation"));

    expect(screen.getByText("Tower of God")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("shows the title when there is no cover at all", () => {
    render(<CoverImage src={null} title="Tower of God" sizes="130px" />);

    expect(screen.getByText("Tower of God")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("falls back to an icon where a title would not fit", () => {
    const { container } = render(
      <CoverImage src={null} sizes="36px" fallback="icon" />,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("re-tries a cover that a previous row failed to load", () => {
    // The lists these render in reuse rows across renders, so a failure held
    // as a bare boolean would blank the next title's perfectly good cover.
    const { rerender } = render(
      <CoverImage src={COVER} title="Tower of God" sizes="130px" />,
    );

    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.getByText("Tower of God")).toBeInTheDocument();

    const next = "https://cdn.myanimelist.net/images/manga/2/238873l.jpg";
    rerender(<CoverImage src={next} title="Solo Leveling" sizes="130px" />);

    expect(screen.getByRole("presentation")).toHaveAttribute("src", next);
  });
});
