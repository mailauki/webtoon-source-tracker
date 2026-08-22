import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms for using Webtoon Source Tracker, a personal reading tracker.",
};

/** Change when the substance changes, not on copy edits. */
const LAST_UPDATED = "August 21, 2026";

export default function TermsOfServicePage() {
  return (
    <article className="prose-legal">
      <h1 className="font-display text-2xl font-bold">Terms of Service</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {LAST_UPDATED}
      </p>

      <p className="mt-6">
        These terms cover your use of Webtoon Source Tracker (&ldquo;the
        app&rdquo;). Using the app means agreeing to them. The app is a free,
        personal project, and these terms are written to match that rather than
        to imply anything more.
      </p>

      <h2>What the app is</h2>
      <p>
        A personal tracker for recording which platform you read each manga or
        webtoon on, layered on top of your MyAnimeList list. It hosts no comics
        and links to no unlicensed ones. Any URL stored against a title is one
        you entered yourself.
      </p>

      <h2>Your account</h2>
      <p>
        You need an account to use the app, and you are responsible for keeping
        access to it secure. Provide an email address you actually control —
        it is the only way to recover the account. You may delete your account
        at any time, as described in the{" "}
        <Link href="/privacy-policy" className="text-brand underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>Connecting MyAnimeList</h2>
      <p>
        Connecting a MyAnimeList account is optional. When you connect one, you
        authorize the app to read your manga list and to write progress updates
        you make in the app back to that list.
      </p>
      <p>
        MyAnimeList is a separate service with its own terms, and your use of it
        is governed by those terms rather than these. The app is not affiliated
        with, endorsed by, or operated by MyAnimeList. The connection depends on
        their API, which may change or become unavailable; if it does, syncing
        may stop working, and the source assignments you entered remain
        readable in the app regardless.
      </p>

      <h2>Acceptable use</h2>
      <p>Do not:</p>
      <ul>
        <li>
          Use the app to store or distribute links to pirated or otherwise
          unlawful copies of works.
        </li>
        <li>
          Attempt to access another user&rsquo;s data, or probe the service for
          vulnerabilities other than in good faith.
        </li>
        <li>
          Automate requests in a way that burdens the service or that would
          breach MyAnimeList&rsquo;s API rate limits through it.
        </li>
        <li>Use the app to break any law that applies to you.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        The source assignments, URLs, and notes you enter remain yours. You
        grant only what running the app requires: permission to store and
        display that content back to you. Title metadata and cover images come
        from MyAnimeList and remain the property of their respective rights
        holders.
      </p>

      <h2>Availability</h2>
      <p>
        The app is provided as-is, with no guarantee of uptime, and may change
        or shut down at any time. It is a personal project, not a commercial
        service with a support commitment. Notice will be given before any
        planned shutdown where reasonably possible, so you can export your data.
      </p>

      <h2>Disclaimer and liability</h2>
      <p>
        The app is provided without warranties of any kind, express or implied,
        including fitness for a particular purpose. To the fullest extent
        permitted by law, the operator is not liable for any indirect or
        consequential damages, or for lost data, arising from your use of the
        app.
      </p>
      <p>
        Keep your own records of anything you cannot afford to lose. Source
        assignments are entered by hand and cannot be rebuilt from MyAnimeList
        if lost.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the app and delete your account at any time. Access
        may be suspended for a breach of the acceptable use section above.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change materially, the date at the top will change.
        Continuing to use the app after that means accepting the revised terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions:{" "}
        <a href="mailto:julie.ux.dev@gmail.com" className="text-brand underline">
          julie.ux.dev@gmail.com
        </a>
        .
      </p>
    </article>
  );
}
