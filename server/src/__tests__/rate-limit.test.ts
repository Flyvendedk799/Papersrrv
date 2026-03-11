import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockRequest, mockResponse } from "./test-utils.js";
import { rateLimit } from "../middleware/rate-limit.js";

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should allow requests within limit", () => {
    const limiter = rateLimit("test-allow", { windowMs: 60_000, maxRequests: 5 });
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    limiter(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should set rate limit headers", () => {
    const limiter = rateLimit("test-headers", { windowMs: 60_000, maxRequests: 10 });
    const req = mockRequest();
    const res = mockResponse();
    const next = vi.fn();

    limiter(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 10);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 9);
  });

  it("should block requests exceeding limit", () => {
    const limiter = rateLimit("test-block", { windowMs: 60_000, maxRequests: 2 });
    const req = mockRequest();
    const next = vi.fn();

    // First two requests pass
    limiter(req, mockResponse(), next);
    limiter(req, mockResponse(), next);
    expect(next).toHaveBeenCalledTimes(2);

    // Third request blocked
    const res3 = mockResponse();
    limiter(req, res3, next);
    expect(res3.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2); // still 2
  });
});
