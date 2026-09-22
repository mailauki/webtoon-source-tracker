import { BookmarkCheck, Crown, EyeOff, Lock, PauseCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SourceBadgeData = {
  name: string;
  isPrimary?: boolean;
  isPaid?: boolean;
  isOfficial?: boolean;
  isHiatus?: boolean;
  isOwned?: boolean;
};

/**
 * A single source pill.
 *
 * `overlay` renders the frosted treatment for use on top of cover art;
 * otherwise it uses theme surfaces so it reads correctly on the page in both
 * light and dark.
 */
export function SourceBadge({
  source,
  overlay = false,
  className,
}: {
  source: SourceBadgeData;
  overlay?: boolean;
  className?: string;
}) {
  return (
    <Badge
      variant={overlay ? "frosted" : "source"}
      className={cn("gap-1", className)}
      title={[
        source.name,
        source.isPrimary ? "primary" : null,
        source.isPaid ? "paid" : null,
        source.isOfficial === false ? "unofficial" : null,
        source.isHiatus ? "on hiatus" : null,
        source.isOwned ? "owned" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {source.isPrimary ? (
        <Crown className="size-2.5" aria-label="Primary source" />
      ) : null}
      {/* Wrapped rather than bare so a caller can let the name truncate while
          the icons keep their size — see the card's chip row. */}
      <span className="min-w-0">{source.name}</span>
      {source.isPaid ? (
        <Lock className="size-2.5" aria-label="Paid" />
      ) : null}
      {source.isHiatus ? (
        <PauseCircle className="size-2.5" aria-label="On hiatus" />
      ) : null}
      {/* Sits next to the lock rather than replacing it: `isPaid` says the
          source charges and `isOwned` says the user paid, and a pill showing
          both is the common case on a coin-gated app. */}
      {source.isOwned ? (
        <BookmarkCheck className="size-2.5" aria-label="Owned" />
      ) : null}
    </Badge>
  );
}

/**
 * Every place this title is read has paused.
 *
 * Sits in the same corner as NoSourceBadge and is mutually exclusive with it —
 * an entry with no sources has nothing to be on hiatus.
 *
 * Not `alert`: red is reserved for the missing-source gap this app exists to
 * surface, and a paused series is a normal state rather than a problem with
 * the user's records. But not `frosted` either — white-on-translucent-white
 * disappeared entirely against pale cover art, and an invisible badge says
 * nothing. A solid slate ground reads on any artwork while staying visibly
 * calmer than the red.
 */
export function HiatusBadge({ overlay = false }: { overlay?: boolean }) {
  return (
    <Badge
      variant={overlay ? "hiatus" : "source"}
      className="gap-1"
      title="On hiatus at every source"
    >
      Hiatus
    </Badge>
  );
}

/**
 * The user owns this title somewhere they read it.
 *
 * `some`, not `every` — see isOwned. One bought copy is enough to say the
 * title is owned, and attaching a second unbought source must not take the
 * badge away.
 *
 * Not mutually exclusive with HiatusBadge: owning a series that has since
 * paused is ordinary, and both facts are worth saying. It is mutually
 * exclusive with NoSourceBadge by construction — ownership is recorded on a
 * source, so a title with none cannot be owned.
 */
export function OwnedBadge({ overlay = false }: { overlay?: boolean }) {
  return (
    <Badge
      variant={overlay ? "owned" : "source"}
      className="gap-1"
      title="Owned at one or more of your sources"
    >
      <BookmarkCheck className="size-2.5" aria-hidden />
      Owned
    </Badge>
  );
}

/**
 * MyAnimeList rates this title as adult.
 *
 * Only ever rendered for a viewer who is allowed to see the title at all —
 * an account under the age floor never receives the row, so this badge is
 * not what keeps anything hidden. It is a label on something already on
 * screen, so somebody scrolling their own shelf can tell at a glance which
 * covers they might not want open in public.
 *
 * `hiatus`'s solid ground rather than `alert`: red is reserved for the
 * missing-source gap, the one badge here that asks to be acted on. A rating
 * is a fact about the title, not a problem with it.
 *
 * The label reads "18+" rather than "NSFW" — it is shorter on a 130px card,
 * and it says what the rating means rather than naming a category.
 */
export function MatureBadge({ overlay = false }: { overlay?: boolean }) {
  return (
    <Badge
      variant={overlay ? "hiatus" : "source"}
      className="gap-1"
      title="MyAnimeList rates this title as adult"
    >
      <EyeOff className="size-2.5" aria-hidden />
      18+
    </Badge>
  );
}

/** The gap this app exists to surface: a tracked title with nowhere recorded. */
export function NoSourceBadge({ overlay = false }: { overlay?: boolean }) {
  return (
    <Badge
      variant="alert"
      className={overlay ? "backdrop-blur-sm" : undefined}
    >
      No source
    </Badge>
  );
}
