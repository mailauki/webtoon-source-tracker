// Stub for the `server-only` package, aliased in vitest.config.mts.
//
// The real package (node_modules/server-only/index.js) is a bare unconditional
// `throw` — it is meant to be resolved to an empty module by a bundler's
// `react-server` export condition (which is exactly what Next.js does when
// building for the server). Vitest does not honor that export condition, so
// importing DAL code directly in a test would throw at import time, before
// any assertion runs.
//
// Aliasing "server-only" to this empty module mirrors what `react-server`
// already does in the real build, letting tests import `lib/auth/dal.ts`
// directly without deleting the genuine build-time guard from that file.
export {};
