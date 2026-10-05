import { describe, expect, it } from "vitest";
import { calculatePricing, pricingFromPayload, pricingToView } from "../pricing";

describe("model pricing", () => {
  it("calculates video cost by seconds in CNY", () => {
    const pricing = pricingToView(pricingFromPayload({ billingUnit: "video_second", videoPerSecond: 0.5 }));
    expect(calculatePricing({ kind: "video", pricing, durationSeconds: 6 })).toBe(3_000_000);
  });

  it("calculates text cost by million-token rates", () => {
    const pricing = pricingToView(pricingFromPayload({ billingUnit: "token", inputPerMillion: 2, outputPerMillion: 4 }));
    expect(calculatePricing({ kind: "text", pricing, inputTokens: 500_000, outputTokens: 250_000 })).toBe(2_000_000);
  });

  it("keeps image and fixed request pricing separate", () => {
    const pricing = pricingToView(pricingFromPayload({ billingUnit: "image", imagePerImage: 0.8, requestFixed: 0.1 }));
    expect(calculatePricing({ kind: "image", pricing, imageCount: 2 })).toBe(1_700_000);
  });
});
