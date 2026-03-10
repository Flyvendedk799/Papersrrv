import { z } from "zod";

export const FILE_OPERATIONS = ["read", "write", "edit", "delete"] as const;
export type FileOperation = (typeof FILE_OPERATIONS)[number];

export const createFileSnapshotSchema = z.object({
  agentId: z.string().uuid(),
  runId: z.string().uuid(),
  filePath: z.string().min(1),
  content: z.string().optional(),
  operation: z.enum(FILE_OPERATIONS),
});

export type CreateFileSnapshot = z.infer<typeof createFileSnapshotSchema>;

export const indexRunFilesSchema = z.object({
  runId: z.string().uuid(),
  agentId: z.string().uuid(),
  files: z.array(
    z.object({
      filePath: z.string().min(1),
      content: z.string().optional(),
      operation: z.enum(FILE_OPERATIONS),
    }),
  ),
});

export type IndexRunFiles = z.infer<typeof indexRunFilesSchema>;
