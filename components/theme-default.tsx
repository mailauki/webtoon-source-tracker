"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

/** Where this device records the account theme it last applied. */
export const ACCOUNT_THEME_KEY = "theme-account";

/**
 * Applies the theme saved in Settings, overriding the app's default.
 *
 * A device follows the account until someone picks something else with the
 * app-bar toggle: next-themes stores the device's theme under "theme", and
 * this records what it last applied from the account, so a stored theme that
 * differs from that was chosen here and is left alone.
 */
export function ThemeDefault({ theme }: { theme: string | null }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!theme) return;
    try {
      const device = localStorage.getItem("theme");
      if (device === null || device === localStorage.getItem(ACCOUNT_THEME_KEY)) {
        setTheme(theme);
        localStorage.setItem(ACCOUNT_THEME_KEY, theme);
      }
    } catch {
      // Storage blocked: stay on the default rather than fail the page.
    }
  }, [theme, setTheme]);

  return null;
}
