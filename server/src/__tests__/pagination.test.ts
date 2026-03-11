import { describe, it, expect } from "vitest";
import { parsePaginationParams, encodeCursor, decodeCursor, buildPaginatedResponse } from "../lib/pagination.js";

describe("pagination", () => {
  describe("parsePaginationParams", () => {
    it("should use defaults when no params provided", () => {
      const result = parsePaginationParams({});
      expect(result.limit).toBe(50);
      expect(result.cursor).toBeUndefined();
      expect(result.direction).toBe("forward");
    });

    it("should respect provided limit", () => {
      const result = parsePaginationParams({ limit: "25" });
      expect(result.limit).toBe(25);
    });

    it("should cap limit at 200", () => {
      const result = parsePaginationParams({ limit: "500" });
      expect(result.limit).toBe(200);
    });

    it("should floor limit at 1", () => {
      const result = parsePaginationParams({ limit: "-5" });
      expect(result.limit).toBe(1);
    });

    it("should handle invalid limit", () => {
      const result = parsePaginationParams({ limit: "abc" });
      expect(result.limit).toBe(50);
    });
  });

  describe("cursor encoding/decoding", () => {
    it("should roundtrip cursor values", () => {
      const values = { id: "abc-123", createdAt: "2024-01-01T00:00:00Z" };
      const cursor = encodeCursor(values);
      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual(values);
    });

    it("should return null for invalid cursor", () => {
      expect(decodeCursor("invalid!!")).toBeNull();
    });
  });

  describe("buildPaginatedResponse", () => {
    it("should paginate correctly when hasMore is true", () => {
      const items = Array.from({ length: 11 }, (_, i) => ({ id: `item-${i}` }));
      const result = buildPaginatedResponse(items, 10, (item) => ({ id: item.id }));
      expect(result.items).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should handle last page correctly", () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: `item-${i}` }));
      const result = buildPaginatedResponse(items, 10, (item) => ({ id: item.id }));
      expect(result.items).toHaveLength(5);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should handle empty result", () => {
      const result = buildPaginatedResponse([], 10, () => ({}));
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });
});
