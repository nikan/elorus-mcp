import * as fs from "node:fs/promises";
import * as path from "node:path";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".tif",
  ".tiff",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

/**
 * Reads a local file for upload as an attachment, gated by ELORUS_ATTACHMENT_ROOT so an MCP
 * caller can't use file_path to read arbitrary files off this machine and exfiltrate them to
 * Elorus. Disabled entirely (fail closed) until that env var is explicitly configured.
 */
export async function readAttachmentFile(filePath: string): Promise<Buffer> {
  const root = process.env.ELORUS_ATTACHMENT_ROOT;
  if (!root) {
    throw new Error(
      "file_path attachments are disabled. Set the ELORUS_ATTACHMENT_ROOT environment variable to the " +
        "folder this server is allowed to read attachments from, then retry — or pass content_base64 instead."
    );
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = await fs.realpath(root);
  } catch {
    throw new Error(`ELORUS_ATTACHMENT_ROOT does not point to an existing directory: ${root}`);
  }

  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(filePath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  const relative = path.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`file_path must be inside the configured attachment root (${resolvedRoot})`);
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported attachment file type "${ext}". Allowed types: ${[...ALLOWED_EXTENSIONS].join(", ")}`
    );
  }

  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${filePath}`);
  }
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `File is ${stat.size} bytes, exceeding the ${MAX_ATTACHMENT_BYTES}-byte attachment size limit`
    );
  }

  return fs.readFile(resolvedPath);
}
