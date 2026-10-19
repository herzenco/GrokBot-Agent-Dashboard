import { describe, expect, it } from "vitest";
import { secretMatches } from "@/lib/password";

describe("dashboard password check", () => {
  it("accepts the exact password", () => {
    expect(secretMatches("correct horse", "correct horse")).toBe(true);
  });

  it("rejects a different password of the same length", () => {
    expect(secretMatches("correct horse", "correct house")).toBe(false);
  });

  it("rejects a shorter or longer password", () => {
    expect(secretMatches("short", "correct horse")).toBe(false);
    expect(secretMatches("correct horse and more", "correct horse")).toBe(false);
  });

  it("rejects every password when the expected secret is empty", () => {
    expect(secretMatches("anything", "")).toBe(false);
    expect(secretMatches("", "")).toBe(false);
  });
});
