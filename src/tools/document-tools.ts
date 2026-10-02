import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { elorusId } from "../schemas/id.js";
import { splitEmailList } from "../email.js";

const textResult = (result: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
});

/** Shared document lifecycle; each resource supplies its own verified writable schemas. */
export function registerDocumentTools(
  server: McpServer,
  client: ElorusClient,
  config: {
    singular: string;
    plural: string;
    path: string;
    createFields: z.ZodRawShape;
    updateFields: z.ZodRawShape;
    patchFields: z.ZodRawShape;
    listFields: z.ZodRawShape;
    voidable: boolean;
    contactField: "client" | "contact" | "supplier";
  }
): void {
  const { singular, plural, path, createFields, updateFields, patchFields, listFields } = config;
  const label = singular.replaceAll("_", " ");
  const idSchema = { id: elorusId(`Elorus ${label} ID`) };
  const optionalUpdateFields = z.object(updateFields).partial().shape;

  server.registerTool(`list_${plural}`, {
    description: `List and filter ${plural.replaceAll("_", " ")}. Date period bounds must be provided together.`,
    inputSchema: listFields,
  }, async (args) => {
    if ((args.period_from === undefined) !== (args.period_to === undefined)) {
      throw new Error("period_from and period_to must be supplied together");
    }
    return textResult(await client.get(path, args));
  });

  server.registerTool(`get_${singular}`, {
    description: `Fetch a single ${label}.`, inputSchema: idSchema,
  }, async ({ id }) => textResult(await client.get(`${path}${id}/`)));

  server.registerTool(`create_${singular}`, {
    description: `Create a ${label}. Use draft: true to save a draft. Monetary values and IDs are strings; taxes are nested objects containing a tax ID.`,
    inputSchema: createFields,
  }, async (args) => {
    validatePrices(args.items, args.calculator_mode ?? "initial");
    return textResult(await client.post(path, args));
  });

  server.registerTool(`update_${singular}`, {
    description: `Update a ${label}. ${Object.keys(patchFields).join(", ")} use PATCH at any status. Other fields require an existing draft and a full PUT. Items replace the entire line list: include every existing line id to retain it.`,
    inputSchema: { ...optionalUpdateFields, ...patchFields, ...idSchema },
  }, async ({ id, ...fields }: Record<string, unknown>) => {
    if (Object.keys(fields).length === 0) throw new Error("Provide at least one field to update");
    if (Object.keys(fields).every((key) => key in patchFields)) {
      return textResult(await client.patch(`${path}${id}/`, fields));
    }
    const current = await client.get<Record<string, unknown>>(`${path}${id}/`);
    if (current.draft !== true) {
      throw new Error(`Only draft ${plural.replaceAll("_", " ")} support full updates. Mark the document as draft in a separate update first.`);
    }
    validatePrices(fields.items, fields.calculator_mode ?? current.calculator_mode ?? "initial");
    // The resource's PUT schema strips read-only response fields, including nested line totals,
    // while preserving existing line IDs and explicit nulls on nullable writable fields.
    const retained = omitNullFields(current);
    const contactField = config.contactField;
    if (fields[contactField] !== undefined && fields[contactField] !== current[contactField]) {
      // Allow the API to initialize the new contact's identity and addresses; never copy
      // the old contact's tax ID/name onto the new contact unless explicitly requested.
      for (const key of Object.keys(retained)) {
        if (key.startsWith(`${contactField}_`) || key === "billing_address" || key === "shipping_address") {
          delete retained[key];
        }
      }
    }
    const body = z.object(updateFields).parse({ ...retained, ...fields });
    await resolveUnitSymbols(body.items, client);
    return textResult(await client.put(`${path}${id}/`, body));
  });

  server.registerTool(`delete_${singular}`, {
    description: `Permanently delete a draft ${label}. Issued documents cannot be deleted.`, inputSchema: idSchema,
  }, async ({ id }) => {
    await client.delete(`${path}${id}/`);
    return textResult({ id, deleted: true });
  });

  if (config.voidable) server.registerTool(`void_${singular}`, {
    description: `Void an issued ${label}, retaining its record.`, inputSchema: idSchema,
  }, async ({ id }) => textResult(await client.put(`${path}${id}/void/`, { void: true })));

  server.registerTool(`send_${singular}_email`, {
    description: `Email a ${label}, using the organization's defaults for omitted fields.`,
    inputSchema: {
      ...idSchema,
      to: z.string().email().optional().describe("Recipient email address"),
      subject: z.string().optional().describe("Email subject"),
      message: z.string().optional().describe("Email body, possibly HTML"),
      cc: z.array(z.string().email()).optional().describe("CC addresses; [] clears defaults"),
      bcc: z.array(z.string().email()).optional().describe("BCC addresses; [] clears defaults"),
      attach_pdf: z.boolean().default(true).describe("Attach the document PDF"),
    },
  }, async ({ id, to, subject, message, cc, bcc, attach_pdf }) => {
    const defaults = await client.get<{ to?: string; subject?: string; message?: string; cc?: string; bcc?: string }>(`${path}${id}/email/`);
    return textResult(await client.post(`${path}${id}/email/`, {
      to: to ?? defaults.to, subject: subject ?? defaults.subject, message: message ?? defaults.message,
      cc: cc ?? splitEmailList(defaults.cc), bcc: bcc ?? splitEmailList(defaults.bcc), attach_pdf,
    }));
  });

  server.registerTool(`export_${singular}_pdf`, {
    description: `Export a ${label} as an inline base64 PDF.`, inputSchema: idSchema,
  }, async ({ id }) => {
    const { data, contentType } = await client.getBinary(`${path}${id}/pdf/`);
    return { content: [{ type: "resource" as const, resource: {
      uri: `elorus:/${path}${id}/pdf`, mimeType: contentType, blob: data.toString("base64"),
    } }] };
  });
}

function validatePrices(items: unknown, mode: unknown): void {
  if (!Array.isArray(items)) return;
  items.forEach((item, index) => {
    // Goods receipts and unpriced delivery notes have no monetary values. Product-linked
    // estimates may inherit their price. Validate explicit pricing against the effective mode.
    if (item.unit_value === undefined && item.unit_total === undefined && !(mode === "total_pre_discount" && item.unit_value_gross !== undefined)) return;
    // total_pre_discount prices are entered gross (tax-inclusive, before discount), so the gross
    // price is its required input rather than the tax-exclusive unit_value.
    const field = mode === "total" ? "unit_total" : mode === "total_pre_discount" ? "unit_value_gross" : "unit_value";
    if (item[field] === undefined) throw new Error(`items[${index}]: calculator_mode '${mode}' requires ${field}`);
  });
}

/** GET may return null for optional fields that the PUT schema does not accept as null. */
function omitNullFields(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => [key, Array.isArray(value)
      ? value.map(item => item && typeof item === "object" ? omitNullFields(item) : item)
      : value && typeof value === "object" ? omitNullFields(value as Record<string, unknown>) : value]));
}

/** The live API returns unit IDs on GET, but v1.2 document PUT requires symbols. */
async function resolveUnitSymbols(items: unknown, client: ElorusClient): Promise<void> {
  if (!Array.isArray(items)) return;
  const symbols = new Map<string, string>();
  for (const item of items) {
    const unit = item.unit_measure;
    if (typeof unit !== "string" || !/^\d{10,}$/.test(unit)) continue;
    if (!symbols.has(unit)) {
      const result = await client.get<{ symbol: string }>(`/unitofmeasurement/${unit}/`);
      if (typeof result.symbol !== "string" || result.symbol.length === 0) {
        throw new Error(`Cannot resolve unit of measurement ${unit} to a symbol`);
      }
      symbols.set(unit, result.symbol);
    }
    item.unit_measure = symbols.get(unit);
  }
}
