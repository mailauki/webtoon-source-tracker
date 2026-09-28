import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyAndDecodeTransaction, SignedDataVerifier } = vi.hoisted(() => ({
  verifyAndDecodeTransaction: vi.fn(),
  SignedDataVerifier: vi.fn(),
}));

// Only SignedDataVerifier is faked; VerificationException/VerificationStatus/
// Environment stay real so verifyTransaction's `instanceof` and status checks
// run against the genuine classes/enum.
vi.mock("@apple/app-store-server-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@apple/app-store-server-library")>()),
  SignedDataVerifier,
}));

import { Environment, VerificationException, VerificationStatus } from "@apple/app-store-server-library";

import { verifyTransaction } from "@/lib/apple/verify-transaction";

const payload = (over: object = {}) => ({
  productId: "pro_unlock",
  originalTransactionId: "1000",
  appAccountToken: "3f1c6a52-0000-4000-8000-000000000001",
  revocationDate: undefined,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPLE_BUNDLE_ID = "com.julieevanspersonalteam.WebtoonSourceTracker";
  process.env.APPLE_APP_APPLE_ID = "123456789";
  SignedDataVerifier.mockImplementation(function (this: object, _certs: unknown, _online: unknown, environment: Environment) {
    return Object.assign(this, {
      verifyAndDecodeTransaction: (jws: string) => verifyAndDecodeTransaction(environment, jws),
    });
  });
});

describe("verifyTransaction", () => {
  it("verifies against Production first and returns its payload when that succeeds", async () => {
    verifyAndDecodeTransaction.mockResolvedValueOnce(payload());
    const result = await verifyTransaction("jws");
    expect(result).toEqual({
      productId: "pro_unlock",
      originalTransactionId: "1000",
      appAccountToken: "3f1c6a52-0000-4000-8000-000000000001",
      revoked: false,
    });
    expect(verifyAndDecodeTransaction).toHaveBeenCalledTimes(1);
    expect(verifyAndDecodeTransaction).toHaveBeenCalledWith(Environment.PRODUCTION, "jws");
  });

  it("falls back to Sandbox only when Production reports INVALID_ENVIRONMENT", async () => {
    verifyAndDecodeTransaction.mockImplementationOnce((environment: Environment) => {
      if (environment === Environment.PRODUCTION) {
        throw new VerificationException(VerificationStatus.INVALID_ENVIRONMENT);
      }
      return Promise.resolve(payload());
    });
    verifyAndDecodeTransaction.mockResolvedValueOnce(payload());

    const result = await verifyTransaction("jws");
    expect(result.productId).toBe("pro_unlock");
    expect(verifyAndDecodeTransaction).toHaveBeenCalledTimes(2);
    expect(verifyAndDecodeTransaction).toHaveBeenNthCalledWith(1, Environment.PRODUCTION, "jws");
    expect(verifyAndDecodeTransaction).toHaveBeenNthCalledWith(2, Environment.SANDBOX, "jws");
  });

  it("rethrows any other VerificationException status without retrying as Sandbox", async () => {
    verifyAndDecodeTransaction.mockRejectedValueOnce(new VerificationException(VerificationStatus.VERIFICATION_FAILURE));
    await expect(verifyTransaction("jws")).rejects.toMatchObject({ status: VerificationStatus.VERIFICATION_FAILURE });
    expect(verifyAndDecodeTransaction).toHaveBeenCalledTimes(1);
  });

  it("rethrows RETRYABLE_VERIFICATION_FAILURE (Apple's OCSP unreachable) without retrying as Sandbox", async () => {
    verifyAndDecodeTransaction.mockRejectedValueOnce(
      new VerificationException(VerificationStatus.RETRYABLE_VERIFICATION_FAILURE),
    );
    await expect(verifyTransaction("jws")).rejects.toMatchObject({
      status: VerificationStatus.RETRYABLE_VERIFICATION_FAILURE,
    });
    expect(verifyAndDecodeTransaction).toHaveBeenCalledTimes(1);
  });
});
