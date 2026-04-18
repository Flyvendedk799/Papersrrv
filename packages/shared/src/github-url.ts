/**
 * Light repo URL canonicalization (backlog 4.0 E2 lite variant).
 *
 * Pure helper: parse common GitHub URL formats into `{ owner, repo }`.
 * Returns `null` for unparseable / non-GitHub input.
 *
 * Accepted forms:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   https://github.com/owner/repo/
 *   http(s)://www.github.com/owner/repo
 *   git@github.com:owner/repo.git
 *   github.com/owner/repo
 *   owner/repo   (bare shorthand — only if both segments are valid slugs)
 */

export interface ParsedGithubRepo {
  owner: string;
  repo: string;
}

const SLUG_RE = /^[A-Za-z0-9._-]+$/;

export function parseRepoUrl(input: string | null | undefined): ParsedGithubRepo | null {
  if (!input || typeof input !== "string") return null;
  let raw = input.trim();
  if (!raw) return null;

  // SSH form: git@github.com:owner/repo(.git)
  const sshMatch = raw.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    return validate(sshMatch[1], sshMatch[2]);
  }

  // Strip protocol for easier handling
  raw = raw.replace(/^https?:\/\//i, "");
  raw = raw.replace(/^git:\/\//i, "");

  // Strip www.
  raw = raw.replace(/^www\./i, "");

  // Require github.com host, OR accept bare owner/repo shorthand
  const hostMatch = raw.match(/^github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/i);
  if (hostMatch) {
    return validate(hostMatch[1], hostMatch[2]);
  }

  // Bare shorthand: owner/repo
  const bareMatch = raw.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
  if (bareMatch) {
    return validate(bareMatch[1], bareMatch[2]);
  }

  return null;
}

function validate(owner: string, repo: string): ParsedGithubRepo | null {
  const o = owner.trim();
  const r = repo.trim().replace(/\.git$/i, "");
  if (!o || !r) return null;
  if (!SLUG_RE.test(o) || !SLUG_RE.test(r)) return null;
  return { owner: o, repo: r };
}

/** Canonicalize to a stable `owner/repo` key (lowercased for comparison). */
export function canonicalRepoKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}
