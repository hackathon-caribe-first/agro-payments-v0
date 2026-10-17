import { route, type RouteConfigEntry } from "@react-router/dev/routes";

// Fragment for routes.ts: spread these entries INSIDE layout("routes/layout.tsx", [...]).
// Static paths come before dynamic ones. None of these paths exists in routes.ts today.
export const investmentRoutes: RouteConfigEntry[] = [
  // Investor
  route("investor", "routes/investment.index.tsx"),
  route("investor/projects", "routes/investment.projects.tsx"),
  route("investor/projects/:projectId", "routes/investment.project.tsx"),
  route("investor/proposals", "routes/investment.proposals.tsx"),
  route("investor/proposals/:proposalId", "routes/investment.proposal.tsx"),
  route("investor/contracts/:contractId", "routes/investment.contract.tsx"),
  // Producer: answers proposals and signs; never starts one
  route("producer/proposals", "routes/investment.producer-proposals.tsx"),
  route("producer/proposals/:proposalId", "routes/investment.producer-proposal.tsx"),
  route("producer/contracts/:contractId", "routes/investment.producer-contract.tsx"),
];
