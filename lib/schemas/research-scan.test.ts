import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { researchScanSchema } from "@/lib/schemas/research-scan";

describe("researchScanSchema", () => {
  it("accepts the Cardinal v2 reference output", () => {
    const fixture = JSON.parse(readFileSync("fixtures/cardinal-v2.json", "utf8"));
    const result = researchScanSchema.safeParse(fixture);

    expect(result.error?.issues ?? []).toEqual([]);
    expect(result.data?.items).toHaveLength(68);
    expect(result.data?.not_eligible).toHaveLength(26);
    expect(result.data?.manual_checks).toHaveLength(32);
  });
});
