import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What Webtoon Source Tracker stores, why, and how to delete it.",
};

/** Change when the substance changes, not on copy edits. */
const LAST_UPDATED = "August 21, 2026";

export default function PrivacyPolicyPage() {
  return (
    <article className="prose-legal">
      <h1 className="font-display text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {LAST_UPDATED}
      </p>

      <p className="mt-6">
        Webtoon Source Tracker (&ldquo;the app&rdquo;) tracks which app or site
        you read each manga and webtoon on. This policy describes what the app
        stores, why it stores it, and how to remove it.
      </p>

      <h2>The short version</h2>
      <p>
        The app stores your email address, the reading data it syncs from
        MyAnimeList, and the source assignments you enter yourself. It does not
        serve ads, does not use analytics or tracking cookies, and does not
        sell or share your data with anyone.
      </p>

      <h2>What the app stores</h2>

      <h3>Account</h3>
      <p>
        Your email address and, if you signed in with Google or Discord, the
        account identifier that provider returns. Passwords are handled by
        Supabase Auth and are stored hashed; the app never sees them.
      </p>

      <h3>MyAnimeList data</h3>
      <p>
        If you connect a MyAnimeList account, the app stores your manga list as
        it exists on MyAnimeList: titles, cover images, reading status,
        chapter and volume progress, and scores. It also stores OAuth access
        and refresh tokens so it can keep that list in sync without asking you
        to sign in again.
      </p>
      <p>
        Those tokens are kept in a restricted database schema that is not
        reachable through the public data API, and are read only by
        server-side code acting on your behalf. Connecting MyAnimeList is
        optional, and the app requests only the list-access scope it needs.
      </p>

      <h3>Source assignments</h3>
      <p>
        The reason the app exists: for each title, the platforms you read it on,
        plus any URL, per-source progress, and notes you add. This data is
        entered by you and is not sent to MyAnimeList or anywhere else.
      </p>

      <h3>Preferences</h3>
      <p>
        Your saved library filters and sort order, and your light or dark theme
        choice. The theme is kept in your browser, not on the server.
      </p>

      <h2>What the app does not store</h2>
      <ul>
        <li>Payment details — the app is free and takes no payments.</li>
        <li>Analytics, advertising, or cross-site tracking cookies.</li>
        <li>
          Your MyAnimeList password. Connecting an account uses OAuth, so your
          credentials are entered on MyAnimeList and never reach this app.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        The app sets cookies for one purpose: keeping you signed in. There is a
        session cookie issued by Supabase Auth, and two short-lived cookies
        during the MyAnimeList connection flow that exist to prevent request
        forgery and are deleted as soon as the connection completes. No cookie
        is used for advertising or analytics.
      </p>

      <h2>Who your data is shared with</h2>
      <p>
        Nobody, in the sense of selling or disclosing it. The app runs on
        infrastructure operated by third parties who necessarily process it:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — database, authentication, and storage.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting.
        </li>
        <li>
          <strong>MyAnimeList</strong> — only if you connect an account, and
          only in the direction you initiate. Progress edits you make in the app
          are written to your MyAnimeList list; source assignments never are.
        </li>
        <li>
          <strong>Google or Discord</strong> — only if you use one to sign in.
        </li>
      </ul>

      <h2>How long data is kept</h2>
      <p>
        Account and reading data is kept until you delete it. Disconnecting
        MyAnimeList deletes the stored tokens immediately; the synced titles and
        your source assignments remain, so reconnecting later does not lose your
        work.
      </p>

      <h2>Deleting your data</h2>
      <p>
        You can disconnect MyAnimeList at any time from Settings, which removes
        the stored tokens and stops all syncing. To delete your account and
        everything attached to it, contact the address below. Deletion cascades:
        removing the account removes its profile, connection, synced entries,
        and source assignments.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct,
        export, or delete your personal data, and to object to its processing.
        The app holds little enough that most of this is available directly in
        the interface; for anything else, use the contact address below.
      </p>

      <h2>Children</h2>
      <p>
        The app is not directed at children under 13 and does not knowingly
        collect their data.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes materially, the date at the top will change.
        Continuing to use the app after that means accepting the revised policy.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests:{" "}
        <a href="mailto:julie.ux.dev@gmail.com" className="text-brand underline">
          julie.ux.dev@gmail.com
        </a>
        .
      </p>
    </article>
  );
}
