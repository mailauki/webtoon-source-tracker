import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  PullToRefresh,
  resistCurve,
  shouldStart,
  THRESHOLD,
} from "@/components/pull-to-refresh";

/** jsdom has no ResizeObserver, and the component measures with one. */
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.scrollY = 0;
});

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.unstubAllGlobals();
});

/** Touch events jsdom will dispatch — it has no Touch constructor. */
function touch(type: string, clientY: number) {
  const event = new Event(type, { bubbles: true }) as TouchEvent & {
    touches: { clientY: number }[];
  };
  Object.defineProperty(event, "touches", {
    value: type === "touchend" ? [] : [{ clientY }],
  });
  return event;
}

function pull(from: number, to: number) {
  act(() => {
    window.dispatchEvent(touch("touchstart", from));
  });
  act(() => {
    window.dispatchEvent(touch("touchmove", to));
  });
}

function release() {
  act(() => {
    window.dispatchEvent(touch("touchend", 0));
  });
}

describe("resistCurve", () => {
  it("tracks the finger one-to-one up to the threshold", () => {
    expect(resistCurve(0)).toBe(0);
    expect(resistCurve(30)).toBe(30);
    expect(resistCurve(THRESHOLD)).toBe(THRESHOLD);
  });

  it("slows past the threshold instead of tracking the finger", () => {
    const past = resistCurve(THRESHOLD + 50);

    expect(past).toBeGreaterThan(THRESHOLD);
    expect(past).toBeLessThan(THRESHOLD + 50);
  });

  it("never runs away with a very long drag", () => {
    expect(resistCurve(10_000)).toBeLessThanOrEqual(96);
  });

  it("stays monotonic across the threshold", () => {
    for (let d = 0; d < 200; d += 7) {
      expect(resistCurve(d + 7)).toBeGreaterThanOrEqual(resistCurve(d));
    }
  });
});

describe("shouldStart", () => {
  it("arms the gesture at the top of the page", () => {
    expect(shouldStart(0)).toBe(true);
  });

  // iOS reports a negative scrollY while rubber-banding past the top.
  it("arms it while the page is rubber-banding above the top", () => {
    expect(shouldStart(-20)).toBe(true);
  });

  it("stays out of the way once the page is scrolled", () => {
    expect(shouldStart(1)).toBe(false);
    expect(shouldStart(800)).toBe(false);
  });
});

describe("PullToRefresh", () => {
  it("refreshes when the pull passes the threshold", () => {
    render(<PullToRefresh />);
    pull(0, THRESHOLD + 20);
    release();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh a pull that stops short", () => {
    render(<PullToRefresh />);
    pull(0, THRESHOLD - 20);
    release();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("ignores a pull that starts mid-page", () => {
    window.scrollY = 400;
    render(<PullToRefresh />);
    pull(0, THRESHOLD + 40);
    release();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("abandons the gesture when the finger moves up instead", () => {
    render(<PullToRefresh />);
    act(() => {
      window.dispatchEvent(touch("touchstart", 100));
    });
    act(() => {
      window.dispatchEvent(touch("touchmove", 40));
    });
    release();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("cancels a pull that scrolls away mid-gesture", () => {
    render(<PullToRefresh />);
    act(() => {
      window.dispatchEvent(touch("touchstart", 0));
    });
    window.scrollY = 300;
    act(() => {
      window.dispatchEvent(touch("touchmove", THRESHOLD + 40));
    });
    release();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes once per gesture, not once per touchmove", () => {
    render(<PullToRefresh />);
    act(() => {
      window.dispatchEvent(touch("touchstart", 0));
    });
    for (const y of [20, 40, 60, 80, 100]) {
      act(() => {
        window.dispatchEvent(touch("touchmove", y));
      });
    }
    release();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("treats a cancelled touch as a release", () => {
    render(<PullToRefresh />);
    pull(0, THRESHOLD + 20);
    act(() => {
      window.dispatchEvent(touch("touchcancel", 0));
    });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("stays silent to assistive tech until it is actually refreshing", () => {
    render(<PullToRefresh />);

    expect(screen.getByRole("status", { hidden: true })).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("drops its listeners on unmount", () => {
    const { unmount } = render(<PullToRefresh />);
    unmount();

    pull(0, THRESHOLD + 40);
    release();

    expect(refresh).not.toHaveBeenCalled();
  });
});
