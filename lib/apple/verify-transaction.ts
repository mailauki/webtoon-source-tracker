import "server-only";

import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";

import { APPLE_ROOT_CA_G3 } from "./root-certs";

export type VerifiedTransaction = {
  productId: string;
  originalTransactionId: string;
  appAccountToken?: string;
  revoked: boolean;
};

export { VerificationException, VerificationStatus };

/** APPLE_APP_APPLE_ID as a positive integer, or undefined if unset/unparseable. */
function appAppleId(): number | undefined {
  const raw = Number(process.env.APPLE_APP_APPLE_ID);
  return Number.isInteger(raw) && raw > 0 ? raw : undefined;
}

// One SignedDataVerifier per environment, built lazily on first use and
// reused after that so the library's internal public-key cache (keyed per
// instance) actually gets hit across requests instead of re-fetching Apple's
// signing keys every call.
const verifiers = new Map<Environment, SignedDataVerifier>();

function verifier(environment: Environment) {
  let instance = verifiers.get(environment);
  if (!instance) {
    instance = new SignedDataVerifier(
      [Buffer.from(APPLE_ROOT_CA_G3, "base64")],
      true, // enable OCSP checks of Apple's own signing-certificate chain, and expiry checks against the current date
      environment,
      process.env.APPLE_BUNDLE_ID ?? "",
      environment === Environment.PRODUCTION ? appAppleId() : undefined,
    );
    verifiers.set(environment, instance);
  }
  return instance;
}

/**
 * Checks a StoreKit 2 transaction's JWS against Apple's certificate chain.
 * Production first, then Sandbox: TestFlight and App Review buy in the
 * sandbox but talk to the production server, as Apple's guidance expects.
 *
 * Only retried against Sandbox when Production's verifier reports
 * INVALID_ENVIRONMENT (this transaction was signed for the other
 * environment) — a genuinely bad signature, wrong bundle id, or any other
 * VerificationException (including a transient RETRYABLE_VERIFICATION_FAILURE,
 * when Apple's OCSP responder is unreachable) fails immediately rather than
 * being retried against a verifier that was never going to accept it either.
 * The caller (the route) tells permanent failures apart from
 * RETRYABLE_VERIFICATION_FAILURE to pick 400 vs 503.
 */
export async function verifyTransaction(jws: string): Promise<VerifiedTransaction> {
  let payload;
  try {
    payload = await verifier(Environment.PRODUCTION).verifyAndDecodeTransaction(jws);
  } catch (cause) {
    if (cause instanceof VerificationException && cause.status === VerificationStatus.INVALID_ENVIRONMENT) {
      payload = await verifier(Environment.SANDBOX).verifyAndDecodeTransaction(jws);
    } else {
      throw cause;
    }
  }
  return {
    productId: payload.productId ?? "",
    originalTransactionId: payload.originalTransactionId ?? "",
    appAccountToken: payload.appAccountToken,
    revoked: payload.revocationDate != null,
  };
}
