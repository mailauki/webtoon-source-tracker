"use client";

import { ImageOff } from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";

/**
 * A cover image, with a placeholder for every way it can fail to appear.
 *
 * Every caller already wraps this in a `relative ... bg-muted` box and sizes
 * it themselves, so this renders only what goes inside: the `fill` image, or
 * the stand-in.
 *
 * ---------------------------------------------------------------------------
 * Why `unoptimized`
 * ---------------------------------------------------------------------------
 * These covers deliberately bypass the platform image optimizer.
 *
 * Every cover is a separate source image, and a hosting plan's monthly
 * transformation allowance is finite, so a library that keeps growing will
 * eventually spend it. Past that point `/_next/image` answers 402 for any
 * image it has not already cached — which presents as "the covers I've had a
 * while are fine, the ones I just added are broken", because the ones that
 * still work are precisely the cached ones. Nothing about the new covers is
 * wrong; they are simply the ones that need a transformation.
 *
 * Optimizing buys little here in any case. MAL serves these from its own CDN
 * at roughly 300x450 — about the size the grid renders them — so the saving
 * was a few KB per cover, paid for with a hard dependency on a quota. Serving
 * them as-is removes that dependency.
 *
 * To put optimization back, on a plan with room for it, drop the prop below;
 * `remotePatterns` in next.config.ts is still configured for it.
 *
 * ---------------------------------------------------------------------------
 * Why the load is checked twice
 * ---------------------------------------------------------------------------
 * `onError` only catches failures after hydration. A cover that fails while
 * the server markup is still on screen fires its error event at an element
 * React is not yet listening to, and the event is gone by the time it
 * hydrates — so on a cold load, the case this component exists for is exactly
 * the case `onError` misses. A finished image with no intrinsic width is the
 * only trace such a failure leaves behind, so the ref checks for one on mount.
 */
type CoverImageProps = {
  src: string | null;
  sizes: string;
  className?: string;
  preload?: boolean;
} & (
  /**
   * What stands in when there is no cover. "title" suits a card big enough to
   * read it; "icon" suits a thumbnail that is not, and so has no use for one.
   */
  | { fallback?: "title"; title: string }
  | { fallback: "icon"; title?: never }
);

export function CoverImage({
  src,
  title,
  sizes,
  className,
  preload = false,
  fallback = "title",
}: CoverImageProps) {
  // Keyed by src rather than a bare boolean: these render inside lists whose
  // rows are reused across renders, and a stale `true` would blank a cover
  // that loads perfectly well.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const catchPrehydrationError = useCallback(
    (node: HTMLImageElement | null) => {
      if (node?.complete && node.naturalWidth === 0) setFailedSrc(src);
    },
    [src],
  );

  if (src && failedSrc !== src) {
    return (
      <Image
        src={src}
        // Decorative: every caller renders the title as real text alongside.
        alt=""
        fill
        sizes={sizes}
        preload={preload}
        unoptimized
        className={className}
        ref={catchPrehydrationError}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  if (fallback === "icon") {
    return (
      <div className="flex h-full items-center justify-center">
        <ImageOff className="size-4 text-muted-foreground/60" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-2">
      <span className="line-clamp-6 text-center font-display text-xs font-semibold text-muted-foreground">
        {title}
      </span>
    </div>
  );
}
