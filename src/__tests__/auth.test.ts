import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getConfig } from "../auth.js";

describe("getConfig", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ELORUS_API_KEY;
    delete process.env.ELORUS_ORG_ID;
    delete process.env.ELORUS_DEMO;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when ELORUS_API_KEY is missing", () => {
    process.env.ELORUS_ORG_ID = "org-1";
    expect(() => getConfig()).toThrow("ELORUS_API_KEY environment variable is required");
  });

  it("throws when ELORUS_ORG_ID is missing", () => {
    process.env.ELORUS_API_KEY = "key-1";
    expect(() => getConfig()).toThrow("ELORUS_ORG_ID environment variable is required");
  });

  it("returns apiKey/orgId with demo defaulting to false", () => {
    process.env.ELORUS_API_KEY = "key-1";
    process.env.ELORUS_ORG_ID = "org-1";

    expect(getConfig()).toEqual({ apiKey: "key-1", orgId: "org-1", demo: false });
  });

  it("sets demo: true only when ELORUS_DEMO is exactly '1'", () => {
    process.env.ELORUS_API_KEY = "key-1";
    process.env.ELORUS_ORG_ID = "org-1";
    process.env.ELORUS_DEMO = "1";

    expect(getConfig().demo).toBe(true);
  });

  it("treats any non-'1' ELORUS_DEMO value as false", () => {
    process.env.ELORUS_API_KEY = "key-1";
    process.env.ELORUS_ORG_ID = "org-1";
    process.env.ELORUS_DEMO = "true";

    expect(getConfig().demo).toBe(false);
  });
});
