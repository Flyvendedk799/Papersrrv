import { describe, expect, it } from "vitest";
import {
  buildFilesHref,
  parseFileContextFromSearch,
  fileContextFromActivity,
} from "../fileContext";

describe("fileContext", () => {
  it("buildFilesHref includes only known fields", () => {
    const href = buildFilesHref({
      filePath: "foo/bar.md",
      contentHash: "abc",
      runId: "run-1",
      issueId: "iss-1",
      source: "issue",
    });
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/files");
    expect(url.searchParams.get("file")).toBe("foo/bar.md");
    expect(url.searchParams.get("hash")).toBe("abc");
    expect(url.searchParams.get("runId")).toBe("run-1");
    expect(url.searchParams.get("issueId")).toBe("iss-1");
    expect(url.searchParams.get("source")).toBe("issue");
  });

  it("parseFileContextFromSearch round-trips", () => {
    const href = buildFilesHref({
      filePath: "a/b.ts",
      contentHash: "h1",
      source: "run",
      runId: "r1",
      agentId: "ag1",
    });
    const url = new URL(href, "http://x");
    const parsed = parseFileContextFromSearch(url.searchParams);
    expect(parsed.filePath).toBe("a/b.ts");
    expect(parsed.contentHash).toBe("h1");
    expect(parsed.runId).toBe("r1");
    expect(parsed.agentId).toBe("ag1");
    expect(parsed.source).toBe("run");
  });

  it("fileContextFromActivity returns null for non-file actions", () => {
    expect(
      fileContextFromActivity({
        action: "issue.updated",
        entityType: "issue",
        entityId: "iss-1",
      }),
    ).toBeNull();
  });

  it("fileContextFromActivity extracts from file.* activity details", () => {
    const ctx = fileContextFromActivity({
      action: "file.edit",
      entityType: "file",
      entityId: "foo/bar.md",
      details: {
        filePath: "foo/bar.md",
        contentHash: "h",
        runId: "r",
        agentId: "ag",
      },
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.filePath).toBe("foo/bar.md");
    expect(ctx?.source).toBe("activity");
    expect(ctx?.runId).toBe("r");
  });
});
