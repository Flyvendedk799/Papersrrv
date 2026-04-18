import { describe, expect, it } from "vitest";
import { parseRepoUrl, canonicalRepoKey } from "@paperclipai/shared";

describe("parseRepoUrl", () => {
  it("parses HTTPS URLs", () => {
    expect(parseRepoUrl("https://github.com/octocat/hello-world")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
    expect(parseRepoUrl("https://github.com/octocat/hello-world.git")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
    expect(parseRepoUrl("https://www.github.com/octocat/hello-world/")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
  });

  it("parses SSH URLs", () => {
    expect(parseRepoUrl("git@github.com:octocat/hello-world.git")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
  });

  it("accepts bare owner/repo", () => {
    expect(parseRepoUrl("octocat/hello-world")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
  });

  it("tolerates trailing paths and whitespace", () => {
    expect(parseRepoUrl("  github.com/octocat/hello-world/pulls/1  ")).toEqual({
      owner: "octocat",
      repo: "hello-world",
    });
  });

  it("rejects invalid input", () => {
    expect(parseRepoUrl("")).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
    expect(parseRepoUrl(undefined)).toBeNull();
    expect(parseRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
    expect(parseRepoUrl("just-a-string")).toBeNull();
    expect(parseRepoUrl("owner/repo with spaces")).toBeNull();
  });

  it("canonicalRepoKey lowercases owner/repo", () => {
    expect(canonicalRepoKey("Octocat", "Hello-World")).toBe("octocat/hello-world");
  });
});
