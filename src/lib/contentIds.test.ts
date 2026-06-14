import { describe, it, expect } from "vitest";
import { parseContentId, contentKey, normalizeContentType } from "./contentIds";

describe("contentIds", () => {
  it("preserves UUID movie ids", () => {
    const id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
    expect(parseContentId("movie", id)).toBe(id);
    expect(parseContentId("short", id)).toBe(id);
  });

  it("parses bigint episode ids", () => {
    expect(parseContentId("episode", "42")).toBe(42);
    expect(parseContentId("show", 7)).toBe(7);
  });

  it("builds stable content keys", () => {
    expect(contentKey("movie", "uuid-1")).toBe("movie_uuid-1");
    expect(contentKey("short", "uuid-1")).toBe("movie_uuid-1");
  });

  it("normalizes short to movie", () => {
    expect(normalizeContentType("short")).toBe("movie");
  });
});
