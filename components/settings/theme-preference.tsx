"use client";

import { useSyncExternalStore, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { saveTheme } from "@/app/actions/theme";
import { ACCOUNT_THEME_KEY } from "@/components/theme-default";
import { Button } from "@/components/ui/button";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const noop = () => () => {};

/**
 * The theme section on /settings.
 *
 * Unlike the app-bar toggle, which only changes this device, a pick here is
 * also saved to the account and applied on every device that hasn't picked
 * its own there (see ThemeDefault).
 */
export function ThemePreference({ saved }: { saved: string | null }) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();

  // next-themes only knows the theme in the browser; until then show the
  // account's choice so the server and client render the same thing.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const current = mounted ? theme : (saved ?? "system");

  function pick(value: string) {
    setTheme(value);
    // This device now follows the account again (see ThemeDefault).
    try {
      localStorage.setItem(ACCOUNT_THEME_KEY, value);
    } catch {}
    startTransition(async () => {
      const { error } = await saveTheme(value);
      if (error) toast.error(error);
    });
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          role="radio"
          aria-checked={current === value}
          variant={current === value ? "secondary" : "outline"}
          size="sm"
          disabled={pending}
          onClick={() => pick(value)}
          className="rounded-pill"
        >
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      ))}
    </div>
  );
}
