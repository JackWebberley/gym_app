import { describe, expect, it, vi } from "vitest";
import { COOKIE_MAX_AGE, createToken, isPasscodeCorrect, verifyToken } from "../auth";

const SECRET = "0123456789abcdef0123456789abcdef";

describe("isPasscodeCorrect", () => {
  it("accepts the configured passcode", () => {
    expect(isPasscodeCorrect("1602", "1602")).toBe(true);
  });

  it("rejects a wrong one", () => {
    expect(isPasscodeCorrect("1603", "1602")).toBe(false);
    expect(isPasscodeCorrect("160", "1602")).toBe(false);
    expect(isPasscodeCorrect("16022", "1602")).toBe(false);
  });

  it("tolerates surrounding whitespace, which phone keyboards add", () => {
    expect(isPasscodeCorrect(" 1602 ", "1602")).toBe(true);
  });

  it("refuses everything when no passcode is configured", () => {
    // Otherwise a missing APP_PASSCODE would silently unlock the whole app.
    expect(isPasscodeCorrect("", undefined)).toBe(false);
    expect(isPasscodeCorrect("anything", undefined)).toBe(false);
    expect(isPasscodeCorrect("", "")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips a freshly issued token", async () => {
    expect(await verifyToken(await createToken(SECRET), SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createToken(SECRET);
    expect(await verifyToken(token, "a-different-secret-entirely-xxxxx")).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    // The signature covers the expiry, so a cookie cannot be extended by hand.
    const token = await createToken(SECRET);
    const [, signature] = token.split(".");
    const farFuture = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
    expect(await verifyToken(`${farFuture}.${signature}`, SECRET)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createToken(SECRET);
    const [expiry, signature] = token.split(".");
    const flipped = signature.slice(0, -1) + (signature.endsWith("a") ? "b" : "a");
    expect(await verifyToken(`${expiry}.${flipped}`, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await createToken(SECRET);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + (COOKIE_MAX_AGE + 60) * 1000);
      expect(await verifyToken(token, SECRET)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects malformed and absent tokens", async () => {
    for (const bad of [undefined, "", ".", "noseparator", "abc.def", "0.0"]) {
      expect(await verifyToken(bad, SECRET)).toBe(false);
    }
  });

  it("rejects any token when no secret is configured", async () => {
    const token = await createToken(SECRET);
    expect(await verifyToken(token, undefined)).toBe(false);
    expect(await verifyToken(token, "")).toBe(false);
  });

  it("issues different signatures over time, so a token is not a constant", async () => {
    const first = await createToken(SECRET);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 60_000);
      expect(await createToken(SECRET)).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });
});
