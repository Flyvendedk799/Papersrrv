/**
 * Archive ingest — unpack a zip into per-file assets + index rows.
 *
 * Called when a project is given a local-archive source. For each
 * entry in the zip we create an `assets` row (so existing asset
 * download and file-serving infra is reused) and a
 * `project_archive_entries` row that indexes path/size/sha1 for the
 * file browser.
 *
 * The whole zip is also stored as one asset (so re-downloading or
 * re-ingesting later is possible). We return summary stats so the
 * project row can store size + entry count.
 */

import yauzl from "yauzl";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { Db } from "@paperclipai/db";
import { assetService, projectService } from "./index.js";
import type { StorageService } from "../storage/types.js";

const MAX_ENTRIES = 5000;
const MAX_TOTAL_UNCOMPRESSED = 200 * 1024 * 1024; // 200 MB soft cap
const SKIP_PREFIXES = ["__MACOSX/", ".DS_Store"];
const TEXT_EXTENSIONS = new Set([
  "md", "txt", "json", "yaml", "yml", "toml", "xml", "csv", "tsv",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "css", "scss", "sass",
  "html", "htm", "svg", "sh", "bash", "zsh", "py", "rb", "go", "rs",
  "java", "kt", "swift", "c", "cc", "cpp", "h", "hpp", "rst", "ini",
  "conf", "cfg", "sql", "lua", "php", "dart", "ex", "exs", "clj",
]);

function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf(".") + 1);
  if (TEXT_EXTENSIONS.has(ext)) return `text/${ext === "md" ? "markdown" : ext === "txt" ? "plain" : ext};charset=utf-8`;
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function shouldSkip(entryName: string): boolean {
  if (!entryName) return true;
  if (entryName.includes("..")) return true;
  return SKIP_PREFIXES.some((p) => entryName.startsWith(p) || entryName.includes(`/${p.replace(/\/$/, "")}`));
}

async function readEntryBuffer(zip: yauzl.ZipFile, entry: yauzl.Entry, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) {
        reject(err ?? new Error("no stream"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > maxBytes) {
          stream.destroy(new Error("Entry exceeds max size"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

export interface ArchiveIngestResult {
  assetId: string;
  filename: string;
  sizeBytes: number;
  entryCount: number;
  rootDir: string | null;
}

/**
 * Ingest a zip archive for a project. Stores the whole zip as an
 * asset, extracts each entry to its own asset, and populates the
 * project_archive_entries index. Replaces any prior index.
 */
export async function ingestProjectArchive(
  db: Db,
  storage: StorageService,
  input: {
    companyId: string;
    projectId: string;
    filename: string;
    buffer: Buffer;
    actor: { agentId: string | null; userId: string | null };
  },
): Promise<ArchiveIngestResult> {
  const assetSvc = assetService(db);
  const projectSvc = projectService(db);

  const archiveStored = await storage.putFile({
    companyId: input.companyId,
    namespace: `projects/${input.projectId}/archive`,
    originalFilename: input.filename,
    contentType: "application/zip",
    body: input.buffer,
  });
  const archiveAsset = await assetSvc.create(input.companyId, {
    provider: archiveStored.provider,
    objectKey: archiveStored.objectKey,
    contentType: archiveStored.contentType,
    byteSize: archiveStored.byteSize,
    sha256: archiveStored.sha256,
    originalFilename: archiveStored.originalFilename,
    createdByAgentId: input.actor.agentId,
    createdByUserId: input.actor.userId,
  });

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(input.buffer, { lazyEntries: true }, (err, z) => {
      if (err || !z) reject(err ?? new Error("unzip failed"));
      else resolve(z);
    });
  });

  const entries: Array<{
    path: string;
    sizeBytes: number;
    sha1: string | null;
    contentType: string | null;
    assetId: string | null;
    isDirectory: boolean;
  }> = [];
  let totalUncompressed = 0;
  let entryCount = 0;
  const rootPrefixes = new Map<string, number>();

  await new Promise<void>((resolve, reject) => {
    zip.readEntry();
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry: yauzl.Entry) => {
      (async () => {
        try {
          if (entryCount >= MAX_ENTRIES) {
            zip.readEntry();
            return;
          }
          const name = entry.fileName;
          if (shouldSkip(name)) {
            zip.readEntry();
            return;
          }
          const isDir = /\/$/.test(name);
          if (isDir) {
            entries.push({
              path: name.replace(/\/$/, ""),
              sizeBytes: 0,
              sha1: null,
              contentType: null,
              assetId: null,
              isDirectory: true,
            });
            entryCount += 1;
            zip.readEntry();
            return;
          }

          const remaining = MAX_TOTAL_UNCOMPRESSED - totalUncompressed;
          if (remaining <= 0) {
            zip.readEntry();
            return;
          }
          const buf = await readEntryBuffer(zip, entry, remaining);
          totalUncompressed += buf.length;

          const sha1 = createHash("sha1").update(buf).digest("hex");
          const contentType = guessContentType(name);
          const stored = await storage.putFile({
            companyId: input.companyId,
            namespace: `projects/${input.projectId}/files`,
            originalFilename: name.split("/").pop() ?? name,
            contentType,
            body: buf,
          });
          const entryAsset = await assetSvc.create(input.companyId, {
            provider: stored.provider,
            objectKey: stored.objectKey,
            contentType: stored.contentType,
            byteSize: stored.byteSize,
            sha256: stored.sha256,
            originalFilename: stored.originalFilename,
            createdByAgentId: input.actor.agentId,
            createdByUserId: input.actor.userId,
          });

          entries.push({
            path: name,
            sizeBytes: buf.length,
            sha1,
            contentType,
            assetId: entryAsset.id,
            isDirectory: false,
          });
          entryCount += 1;

          const firstSeg = name.split("/")[0];
          if (firstSeg) {
            rootPrefixes.set(firstSeg, (rootPrefixes.get(firstSeg) ?? 0) + 1);
          }

          zip.readEntry();
        } catch (err) {
          reject(err);
        }
      })();
    });
  });

  await projectSvc.replaceArchiveEntries(input.projectId, entries);

  const sortedRoots = [...rootPrefixes.entries()].sort((a, b) => b[1] - a[1]);
  const rootDir = sortedRoots.length === 1 ? sortedRoots[0]![0] : null;

  return {
    assetId: archiveAsset.id,
    filename: input.filename,
    sizeBytes: totalUncompressed,
    entryCount,
    rootDir,
  };
}
