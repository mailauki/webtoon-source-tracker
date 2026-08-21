const DEFAULT_STALE_MINUTES = 60;

export function staleMinutes(): number {
  const raw = Number(process.env.SYNC_STALE_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_STALE_MINUTES;
}

/** True when a sync is due (never synced counts as stale). */
export function isStale(
  lastSyncedAt: string | null,
  thresholdMinutes = staleMinutes(),
): boolean {
  if (!lastSyncedAt) return true;

  const elapsedMs = Date.now() - new Date(lastSyncedAt).getTime();
  return elapsedMs > thresholdMinutes * 60_000;
}

/** "3 hours ago" / "just now", for the sync button. */
export function formatLastSynced(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) return "Never synced";

  const elapsedMs = Date.now() - new Date(lastSyncedAt).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `Synced ${days}d ago`;
}
