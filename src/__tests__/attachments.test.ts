import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readAttachmentFile } from "../attachments.js";

describe("readAttachmentFile", () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "elorus-mcp-attachments-"));
    previousRoot = process.env.ELORUS_ATTACHMENT_ROOT;
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    process.env.ELORUS_ATTACHMENT_ROOT = previousRoot;
  });

  it("rejects when ELORUS_ATTACHMENT_ROOT is not configured", async () => {
    delete process.env.ELORUS_ATTACHMENT_ROOT;
    const file = path.join(root, "receipt.pdf");
    fs.writeFileSync(file, "bytes");

    await expect(readAttachmentFile(file)).rejects.toThrow(/ELORUS_ATTACHMENT_ROOT/);
  });

  it("reads a file inside the configured root", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    const file = path.join(root, "receipt.pdf");
    fs.writeFileSync(file, "bytes");

    const buffer = await readAttachmentFile(file);
    expect(buffer.toString()).toBe("bytes");
  });

  it("reads a file inside a nested subdirectory of the configured root", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    const subdir = path.join(root, "2026");
    fs.mkdirSync(subdir);
    const file = path.join(subdir, "receipt.pdf");
    fs.writeFileSync(file, "bytes");

    const buffer = await readAttachmentFile(file);
    expect(buffer.toString()).toBe("bytes");
  });

  it("rejects a file outside the configured root, even via traversal", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "elorus-mcp-outside-"));
    const file = path.join(outside, "secret.pdf");
    fs.writeFileSync(file, "bytes");

    try {
      await expect(readAttachmentFile(file)).rejects.toThrow(/attachment root/);
      await expect(
        readAttachmentFile(path.join(root, "..", path.basename(outside), "secret.pdf"))
      ).rejects.toThrow(/attachment root/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a disallowed file extension", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    const file = path.join(root, "script.exe");
    fs.writeFileSync(file, "bytes");

    await expect(readAttachmentFile(file)).rejects.toThrow(/Unsupported attachment file type/);
  });

  it("rejects a file that exceeds the size limit", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    const file = path.join(root, "big.pdf");
    fs.writeFileSync(file, Buffer.alloc(26 * 1024 * 1024));

    await expect(readAttachmentFile(file)).rejects.toThrow(/exceeding/);
  });

  it("rejects a nonexistent file", async () => {
    process.env.ELORUS_ATTACHMENT_ROOT = root;
    await expect(readAttachmentFile(path.join(root, "missing.pdf"))).rejects.toThrow(/File not found/);
  });
});
