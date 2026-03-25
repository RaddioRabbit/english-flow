import { describe, expect, it } from "vitest";

import { buildGeneratedImageFileName } from "@/lib/image-file-name";

describe("buildGeneratedImageFileName", () => {
  it("creates an ASCII-safe file name for non-Latin book titles", () => {
    const fileName = buildGeneratedImageFileName("鲁滨逊漂流记", "summary", "2026-03-17");

    expect(fileName).toMatch(/^book_[a-z0-9]+_summary_2026-03-17\.png$/);
    expect(fileName).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it("keeps readable ASCII segments when available", () => {
    const fileName = buildGeneratedImageFileName("Robinson Crusoe", "summary", "2026-03-17");

    expect(fileName).toBe("Robinson_Crusoe_summary_2026-03-17.png");
  });
});
