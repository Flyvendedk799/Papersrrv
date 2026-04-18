import { z } from "zod";

/**
 * Create a GitHub connection using a Personal Access Token.
 * Backlog 4.0 A1 — PAT-first strategy.
 */
export const createGithubConnectionSchema = z.object({
  token: z.string().min(1).max(1024),
  accountLogin: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional(),
  /**
   * Optional note — stored on the associated company secret's description.
   */
  description: z.string().max(500).optional().nullable(),
});

export type CreateGithubConnection = z.infer<typeof createGithubConnectionSchema>;

/**
 * Query params for live repo reads (future: filter flags).
 */
export const listGithubPullsQuerySchema = z.object({
  state: z.enum(["open", "closed", "all"]).optional(),
  connectionId: z.string().uuid().optional(),
});

export type ListGithubPullsQuery = z.infer<typeof listGithubPullsQuerySchema>;
