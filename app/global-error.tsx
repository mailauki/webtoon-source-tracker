"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches failures in the root layout itself.
 *
 * This replaces the entire document, so it must render its own <html> and
 * <body> — and it cannot rely on the app's fonts or theme tokens, since the
 * layout that provides them is what failed. Hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#ffffff",
          color: "#000000",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Source Tracker hit an error
        </h1>
        <p style={{ maxWidth: "28rem", color: "#525252" }}>
          Something failed while loading the app. Your data is safe.
        </p>
        <button
          onClick={reset}
          style={{
            borderRadius: "100px",
            border: 0,
            background: "#f6b606",
            color: "#060616",
            fontWeight: 700,
            padding: "0.5rem 1.5rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ fontSize: "0.75rem", color: "#525252" }}>
            Reference: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
