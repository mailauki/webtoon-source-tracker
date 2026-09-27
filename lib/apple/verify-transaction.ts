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

function verifier(environment: Environment) {
  return new SignedDataVerifier(
    [Buffer.from(APPLE_ROOT_CA_G3, "base64")],
    true, // online revocation checks
    environment,
    process.env.APPLE_BUNDLE_ID ?? "",
    environment === Environment.PRODUCTION ? Number(process.env.APPLE_APP_APPLE_ID) : undefined,
  );
}

/**
 * Checks a StoreKit 2 transaction's JWS against Apple's certificate chain.
 * Production first, then Sandbox: TestFlight and App Review buy in the
 * sandbox but talk to the production server, as Apple's guidance expects.
 *
 * Only retried against Sandbox when Production's verifier reports
 * INVALID_ENVIRONMENT (this transaction was signed for the other
 * environment) — a genuinely bad signature, wrong bundle id, or any other
 * VerificationException fails immediately rather than being retried against
 * a verifier that was never going to accept it either.
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
