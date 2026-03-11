export interface PaginationParams {
  cursor?: string; // opaque base64 cursor
  limit: number; // items per page, default 50, max 200
  direction?: "forward" | "backward";
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  total?: number;
}

export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
  const cursor = typeof query.cursor === "string" ? query.cursor : undefined;
  const direction = query.direction === "backward" ? "backward" : "forward";
  return { cursor, limit, direction };
}

export function encodeCursor(values: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(values)).toString("base64url");
}

export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function buildPaginatedResponse<T>(
  items: T[],
  limit: number,
  getCursorValues: (item: T) => Record<string, unknown>,
): PaginatedResult<T> {
  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;
  return {
    items: sliced,
    nextCursor:
      hasMore && sliced.length > 0
        ? encodeCursor(getCursorValues(sliced[sliced.length - 1]))
        : null,
    prevCursor: sliced.length > 0 ? encodeCursor(getCursorValues(sliced[0])) : null,
    hasMore,
  };
}
