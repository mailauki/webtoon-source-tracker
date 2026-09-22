"use client";

import { ListFilter } from "lucide-react";

import { useLibraryFilters } from "@/components/library-grid";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SORT_OPTIONS, type SortKey } from "@/lib/data/library-prefs";
import { Button } from "./ui/button";

export type FilterChip = { value: string; label: string; count?: number };

/**
 * Every library control, as one menu.
 *
 * This replaces five separate controls across two sticky rows — the status
 * chips, the source chips, the hiatus and owned toggles, and the sort menu.
 * Each was defensible alone; together they were a wall of pills above the
 * shelf, and on a phone they took more vertical space than the first row of
 * covers. The chips also made every filter permanently visible, which is the
 * wrong trade: the shelf is the thing worth seeing, and the filters are
 * something you reach for occasionally.
 *
 * What the collapse costs is at-a-glance state — a chip row shows the active
 * status without a click. The trigger buys that back by naming the active
 * status and counting everything else that is on, so the one filter most
 * likely to be set stays legible from outside the menu.
 *
 * Status and source are one-of-many, so they are radio groups in submenus;
 * the two toggles are checkboxes at the top level, since they are booleans and
 * a submenu for one checkbox would be a click with nothing to choose. Sort
 * keeps its own submenu with key and direction, the same pair it always had.
 *
 * The toggles keep the menu open (`onSelect` default-prevented, which is how
 * Radix is told not to close): the grid updates behind it, and someone turning
 * on "Owned only" is usually about to change the sort too. The radio items do
 * close, because picking a status is normally the last thing before looking at
 * the shelf.
 */
export function LibraryFilterMenu({
  statuses,
  sources,
}: {
  statuses: FilterChip[];
  sources: FilterChip[];
}) {
  const {
    status,
    setStatus,
    source,
    setSource,
    hideHiatus,
    setHideHiatus,
    ownedOnly,
    setOwnedOnly,
    hideNsfw,
    setHideNsfw,
    canSeeNsfw,
    sort,
    setSort,
    pending,
  } = useLibraryFilters();

  const statusChips: FilterChip[] = [{ value: "", label: "All" }, ...statuses];
  const sourceChips: FilterChip[] = [
    { value: "", label: "All sources" },
    { value: "none", label: "No source" },
    ...sources,
  ];

  const activeStatus =
    statusChips.find((c) => c.value === status) ?? statusChips[0];
  const sortOption =
    SORT_OPTIONS.find((o) => o.key === sort.key) ?? SORT_OPTIONS[0];
  const directionLabel = sort.direction === "asc" ? sortOption.asc : sortOption.desc;

  // The status is named on the trigger rather than counted, so it is not
  // counted again here — otherwise "Reading" would read as "Reading 1".
  const extras = [source, hideHiatus, ownedOnly, hideNsfw].filter(Boolean)
    .length;

  const anyActive = Boolean(
    status || source || hideHiatus || ownedOnly || hideNsfw,
  );

  function clearAll() {
    // One patch per filter: `update` in the provider takes a partial and each
    // call persists what it changed, so clearing is four small writes rather
    // than a special-case action on the server.
    if (status) setStatus("");
    if (source) setSource("");
    if (hideHiatus) setHideHiatus(false);
    if (ownedOnly) setOwnedOnly(false);
    if (hideNsfw) setHideNsfw(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={anyActive ? "secondary" : "outline"}
          className="rounded-full"
          disabled={pending}
          aria-label={`Filters: ${activeStatus.label}${
            extras ? `, ${extras} more active` : ""
          }`}
        >
          <ListFilter data-icon="inline-start" />
          <span>{activeStatus.label}</span>
          {extras ? (
            <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-brand-foreground tabular-nums">
              {extras}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Status
            <span className="ml-auto pl-4 text-muted-foreground">
              {activeStatus.label}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            {/* A radio group, not toggles: status is one choice, and "All" is
                how it is cleared. Re-selecting the active item is a no-op —
                an item that unset the thing it shows as chosen is a trap. */}
            {/* Guarded because Radix fires this even when the chosen value
                is the one already active, which would persist a write that
                changes nothing on every re-select. */}
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(value) => value !== status && setStatus(value)}
            >
              {statusChips.map((chip) => (
                <DropdownMenuRadioItem key={chip.value || "all"} value={chip.value}>
                  {chip.label}
                  {typeof chip.count === "number" ? (
                    <span className="ml-auto pl-2 text-muted-foreground tabular-nums">
                      {chip.count}
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Source
            <span className="ml-auto pl-4 text-muted-foreground">
              {sourceChips.find((c) => c.value === source)?.label ??
                sourceChips[0].label}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <DropdownMenuRadioGroup
              value={source}
              onValueChange={(value) => value !== source && setSource(value)}
            >
              {sourceChips.map((chip) => (
                <DropdownMenuRadioItem key={chip.value || "all"} value={chip.value}>
                  {chip.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        {/* Both phrased as what is left showing rather than as an action:
            inside a menu these read as states beside the radio choices
            above, where the old standalone "Hide hiatus" button read as a
            verb because a button is a thing you press. */}
        <DropdownMenuCheckboxItem
          checked={hideHiatus}
          onCheckedChange={setHideHiatus}
          onSelect={(e) => e.preventDefault()}
        >
          Hide hiatus
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={ownedOnly}
          onCheckedChange={setOwnedOnly}
          onSelect={(e) => e.preventDefault()}
        >
          Owned only
        </DropdownMenuCheckboxItem>
        {/* Only for an account that may see adult titles at all. One under
            the age floor never receives those rows, so the item would be a
            control that cannot change what is on screen — and it would
            advertise a category the app is not offering that account.

            Unlike its two neighbours this is also a setting: it writes the
            same library_prefs.hide_nsfw the Settings switch does, so turning
            it on here is remembered rather than lasting one session. It is
            here as well so it can be reached while browsing. */}
        {canSeeNsfw ? (
          <DropdownMenuCheckboxItem
            checked={hideNsfw}
            onCheckedChange={setHideNsfw}
            onSelect={(e) => e.preventDefault()}
          >
            Hide adult titles
          </DropdownMenuCheckboxItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Sort
            <span className="ml-auto pl-4 text-muted-foreground">
              {directionLabel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-44">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort.key}
              // Changing the key keeps the direction: switching from
              // newest-updated to newest-added is one decision, and resetting
              // the direction would silently undo the other half of it.
              onValueChange={(key) =>
                key !== sort.key && setSort({ ...sort, key: key as SortKey })
              }
            >
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.key} value={o.key}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />

            {/* Direction is worded in the active key's own terms — "Oldest"/
                "Newest" for a date, "A–Z" for a title — since "ascending"
                leaves the user to work out which end of a date that is. */}
            <DropdownMenuLabel>Order</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sort.direction}
              onValueChange={(direction) =>
                direction !== sort.direction &&
                setSort({ ...sort, direction: direction as "asc" | "desc" })
              }
            >
              <DropdownMenuRadioItem value="desc">
                {sortOption.desc} first
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="asc">
                {sortOption.asc} first
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Only offered when there is something to clear: a permanently
            visible "Clear all" on an unfiltered shelf is a dead row. */}
        {anyActive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={clearAll}>Clear all</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
