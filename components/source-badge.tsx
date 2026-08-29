import { Crown, Lock, PauseCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SourceBadgeData = {
  name: string;
  isPrimary?: boolean;
  isPaid?: boolean;
  isOfficial?: boolean;
  isHiatus?: boolean;
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
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {source.isPrimary ? (
        <Crown className="size-2.5" aria-label="Primary source" />
      ) : null}
      {source.name}
      {source.isPaid ? (
        <Lock className="size-2.5" aria-label="Paid" />
      ) : null}
      {source.isHiatus ? (
        <PauseCircle className="size-2.5" aria-label="On hiatus" />
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
