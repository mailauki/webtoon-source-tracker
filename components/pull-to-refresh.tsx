"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

/** How far the finger travels before the pull would refresh. */
export const THRESHOLD = 64;

/** Where the indicator stops, however much further the finger goes. */
const MAX_PULL = 96;

/**
 * Past the threshold the pull keeps moving, but at a fraction of the finger,
 * so the rubber band communicates "this is as far as it goes" without ever
 * freezing under a finger that is still travelling.
 */
export function resistCurve(distance: number): number {
  if (distance <= THRESHOLD) return distance;
  return Math.min(MAX_PULL, THRESHOLD + (distance - THRESHOLD) * 0.4);
}

/**
 * The gesture only counts from a page already at the top.
 *
 * Otherwise a drag begun mid-list would refresh instead of scrolling — the
 * browser is still scrolling that same drag, so both would run at once.
 */
export function shouldStart(scrollY: number): boolean {
  return scrollY <= 0;
}

/**
 * Pull down at the top of a page to re-fetch it.
 *
 * Touch only, by design: a mouse has no equivalent gesture, and binding this
 * to pointer events would turn an ordinary drag-select near the top of the
 * page into a refresh. Desktop refreshes through the controls already on the
 * page (the library's Sync button) or the browser's own reload.
 *
 * The indicator is fixed under the header rather than pushing the page down.
 * Translating the whole document would fight the sticky filter row, which is
 * positioned against the viewport and would slide out from under the header.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  // Drives the CSS transition: a pull tracks the finger with none, and the
  // release animates back. Kept as state because render reads it.
  const [dragging, setDragging] = useState(false);
  // The refresh is a transition, so `isRefreshing` tracks the real re-fetch
  // rather than a guessed duration. `refreshRequest` counts the releases that
  // asked for one; nothing reads the number. It exists to re-run the retract
  // effect below, which otherwise only wakes when `isRefreshing` changes —
  // and a refresh that settles before React ever commits it as pending
  // changes nothing for that effect to see. Each request is a new number, so
  // it fires on every pull without a flag anyone has to clear.
  const [isRefreshing, startRefresh] = useTransition();
  const [refreshRequest, setRefreshRequest] = useState(0);
  // Where the chrome ends. The filter row wraps on a narrow screen, so this
  // is measured rather than assumed; 60px is the bare header until it is.
  const [chromeBottom, setChromeBottom] = useState(60);

  // Refs, not state: the touch handlers run on every frame of the gesture and
  // must not re-subscribe or re-render to read these. The pull is mirrored
  // into one because render needs it as state, while the handlers subscribe
  // once and would otherwise read whatever it was when they did.
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const applyPull = useCallback((next: number) => {
    pullRef.current = next;
    setPull(next);
  }, []);

  // Called from a touch handler, never from a state updater. An updater runs
  // during render, and React refuses to start a transition from there: the
  // refresh went out untracked, `isRefreshing` never flipped, and the
  // indicator stayed pinned open with every later gesture locked out behind
  // the guard in onTouchStart.
  const requestRefresh = useCallback(() => {
    refreshingRef.current = true;
    setRefreshRequest((n) => n + 1);
    startRefresh(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const chrome = document.querySelector("[data-app-chrome]");

    function measure() {
      const header = document.querySelector("header");
      const headerBottom = header?.getBoundingClientRect().bottom ?? 60;
      const chromeRect = chrome?.getBoundingClientRect();
      // The sticky wrapper is empty on pages with no filters, so it collapses
      // to the header's own bottom edge — max() covers both cases.
      setChromeBottom(Math.max(headerBottom, chromeRect?.bottom ?? 0));
    }

    measure();

    // The filter row reflows on resize, which moves the edge the indicator
    // hangs from.
    const observer = new ResizeObserver(measure);
    if (chrome) observer.observe(chrome);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    function onTouchStart(event: TouchEvent) {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (!shouldStart(window.scrollY)) return;
      startY.current = event.touches[0].clientY;
      pulling.current = true;
      setDragging(true);
    }

    function onTouchMove(event: TouchEvent) {
      if (!pulling.current || startY.current === null) return;

      const distance = event.touches[0].clientY - startY.current;

      // An upward move means the user is scrolling, not pulling. Hand the
      // gesture back rather than swallowing the rest of it.
      if (distance <= 0) {
        pulling.current = false;
        startY.current = null;
        setDragging(false);
        applyPull(0);
        return;
      }

      // Scrolling away mid-pull (momentum from a previous flick) cancels it.
      if (!shouldStart(window.scrollY)) {
        pulling.current = false;
        startY.current = null;
        setDragging(false);
        applyPull(0);
        return;
      }

      applyPull(resistCurve(distance));
    }

    function onTouchEnd() {
      if (!pulling.current) return;
      pulling.current = false;
      startY.current = null;
      setDragging(false);

      if (pullRef.current < THRESHOLD) {
        applyPull(0);
        return;
      }

      // Hold the indicator at the threshold while the route re-fetches.
      applyPull(THRESHOLD);
      requestRefresh();
    }

    // `passive` throughout: this never calls preventDefault, so declaring it
    // lets the browser keep scrolling off the main thread.
    const options = { passive: true } as const;
    window.addEventListener("touchstart", onTouchStart, options);
    window.addEventListener("touchmove", onTouchMove, options);
    window.addEventListener("touchend", onTouchEnd, options);
    window.addEventListener("touchcancel", onTouchEnd, options);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyPull, requestRefresh]);

  // Retract once the transition settles — the server content has arrived.
  // `refreshRequest` is a dependency and not a value here: it is what makes
  // this run for a refresh whose pending flag never changed, which would
  // otherwise leave the indicator open for good.
  useEffect(() => {
    if (isRefreshing || !refreshingRef.current) return;
    refreshingRef.current = false;
    applyPull(0);
  }, [refreshRequest, isRefreshing, applyPull]);

  const refreshing = isRefreshing;
  const active = pull > 0 || refreshing;
  const ready = pull >= THRESHOLD;

  return (
    <div
      aria-hidden={!refreshing}
      // Announced only while refreshing: the pull itself is visible feedback
      // for a sighted touch user, but "refreshing" is a state worth speaking.
      role="status"
      className="pointer-events-none fixed inset-x-0 z-30 flex justify-center"
      style={{
        top: chromeBottom,
        // Ride the finger down from behind the chrome.
        transform: `translateY(${active ? pull : 0}px)`,
        opacity: active ? 1 : 0,
        transition: dragging ? undefined : "transform 200ms, opacity 200ms",
      }}
    >
      <span className="sr-only">{refreshing ? "Refreshing" : ""}</span>
      <div
        className={cn(
          "-mt-4 flex size-9 items-center justify-center rounded-full border border-border bg-background shadow-sm",
          ready && !refreshing && "border-brand text-brand",
        )}
      >
        {refreshing ? (
          <Loader2 className="size-4 animate-spin text-brand" />
        ) : (
          <RefreshCw
            className="size-4 transition-transform"
            // Winds up as the pull approaches the threshold.
            style={{ transform: `rotate(${(pull / THRESHOLD) * 180}deg)` }}
          />
        )}
      </div>
    </div>
  );
}
