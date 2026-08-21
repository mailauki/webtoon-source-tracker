import { Crown, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SourceBadgeData = {
  name: string;
  isPrimary?: boolean;
  isPaid?: boolean;
  isOfficial?: boolean;
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
