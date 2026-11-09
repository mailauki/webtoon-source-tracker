import { useEffect, useState } from "react";

/**
 * The value a streamed promise settles to, or `fallback` until it has.
 *
 * For the entry page's editors, which render from the database at once and
 * take the live sites' answers (a higher chapter count, AniList's links) when
 * they arrive. The page used to swap a fallback editor for a second one behind
 * Suspense, and the swap remounted it: anything typed, a form left open, or a
 * save in flight was thrown away the moment AniList answered. Reading the
 * promise here keeps one editor mounted the whole time.
 *
 * The last settled value is kept while a newer promise is pending — every
 * save re-renders the page and hands over a fresh promise, and dropping back
 * to the stored value in between would make the count flicker. A rejected
 * promise leaves whatever was showing.
 */
export function useSettled<T>(promise: Promise<T> | undefined, fallback: T): T {
  const [settled, setSettled] = useState<{ value: T } | null>(null);

  useEffect(() => {
    if (!promise) return;
    let current = true;
    promise.then(
      (value) => {
        if (current) setSettled({ value });
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [promise]);

  return settled ? settled.value : fallback;
}
