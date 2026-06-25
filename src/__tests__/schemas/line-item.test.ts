import { describe, it, expect } from "vitest";
import { lineItemSchema } from "../../schemas/line-item.js";

const valid = { title: "Widget", quantity: "2", unit_value: "50.00" };

describe("lineItemSchema", () => {
  it("accepts a valid item with unit_value", () => {
    expect(lineItemSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a valid item with unit_total", () => {
    const result = lineItemSchema.safeParse({ title: "Widget", quantity: "1", unit_total: "62.00" });
    expect(result.success).toBe(true);
  });

  it("accepts optional fields: taxes, discount, product", () => {
    const result = lineItemSchema.safeParse({
      ...valid,
      taxes: ["tax-id-1"],
      discount: "10.00",
      product: "prod-id-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects when both unit_value and unit_total are missing", () => {
    const result = lineItemSchema.safeParse({ title: "Widget", quantity: "1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.includes("unit_value") || m.includes("unit_total"))).toBe(true);
    }
  });

  it("rejects when both unit_value and unit_total are provided", () => {
    const result = lineItemSchema.safeParse({
      title: "Widget",
      quantity: "1",
      unit_value: "50.00",
      unit_total: "62.00",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.errors.map((e) => e.message);
      expect(messages.some((m) => m.includes("not both"))).toBe(true);
    }
  });

  it("rejects missing title", () => {
    const result = lineItemSchema.safeParse({ quantity: "1", unit_value: "50.00" });
    expect(result.success).toBe(false);
  });

  it("rejects missing quantity", () => {
    const result = lineItemSchema.safeParse({ title: "Widget", unit_value: "50.00" });
    expect(result.success).toBe(false);
  });
});
