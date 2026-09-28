import { Sparkles } from "lucide-react";
import Link from "next/link";

import { PRO_MESSAGES, type ProFeature } from "@/lib/pro";

/** Stands in for a control the user can't use without Pro. */
export function ProTeaser({ feature }: { feature: ProFeature }) {
  return (
    <Link
      href="/pro"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline"
    >
      <Sparkles className="size-4 text-brand" aria-hidden />
      {PRO_MESSAGES[feature]} <span className="font-medium text-foreground">Get Pro</span>
    </Link>
  );
}
