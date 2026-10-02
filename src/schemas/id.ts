import { z } from "zod";

/**
 * An Elorus record ID used as a URL path segment. Elorus IDs are numeric strings, so anything
 * else — notably "../contacts/5", which `new URL()` would normalize into a different endpoint —
 * is rejected before a request is built.
 */
export const elorusId = (description: string) =>
  z.string().regex(/^\d+$/, "Must be a numeric Elorus ID (digits only)").describe(description);
