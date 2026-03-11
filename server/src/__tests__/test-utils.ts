/**
 * Test utilities for Paperclip server tests.
 *
 * These helpers provide mock objects and setup for integration tests.
 * For full integration tests with a real database, set TEST_DATABASE_URL.
 */

import type { Request, Response } from "express";

/** Create a mock Express request */
export function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    actor: { type: "board", userId: "test-user", source: "test" },
    requestId: "test-request-id",
    ...overrides,
  } as unknown as Request;
}

/** Create a mock Express response with spy methods */
export function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res as Response;
}

/** Wait for a condition to be true (polling) */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
