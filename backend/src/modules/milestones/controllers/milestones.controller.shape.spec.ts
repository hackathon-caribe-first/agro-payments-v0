import { sampleMilestone, storeWith } from "../application/testing";
import { MilestonesController } from "./milestones.controller";

// The PRD fields added to the aggregate are served by /api/milestones only; the legacy wire shape is unchanged.
const LEGACY_KEYS = ["amount", "assetScale", "closedAt", "currency", "evidence", "fundedAt", "id", "lines", "review", "status", "title"];

describe("MilestonesController legacy shape", () => {
  const controller = () =>
    new MilestonesController(storeWith(sampleMilestone()), ...([null, null, null, null, null] as unknown as [never, never, never, never, never]));

  it("lists and gets milestones with exactly the legacy MilestoneDto keys", async () => {
    const [listed] = await controller().list();
    expect(Object.keys(listed).sort()).toEqual(LEGACY_KEYS);
    expect(Object.keys(await controller().get("m1")).sort()).toEqual(LEGACY_KEYS);
  });
});
