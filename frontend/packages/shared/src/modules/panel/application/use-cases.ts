import { ok } from "../../milestones/domain/errors";
import { attemptOps } from "../domain/errors";
import type { InvestorPanel } from "../domain/panel";
import type { PanelIdentity, PanelRepository } from "./panel-repository";

// RF-19 / RNF-08: one read of everything the panel shows. The route revalidates it every 10 s.
export const loadInvestorPanel = (repo: PanelRepository, identity: PanelIdentity) =>
  attemptOps<InvestorPanel>(async () => ok(await repo.loadInvestorPanel(identity)));
