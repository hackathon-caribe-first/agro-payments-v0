import { CreateMilestones1792108800000 } from "./1792108800000-create-milestones";
import { CreateGrants1792108800001 } from "./1792108800001-create-grants";
import { CreateProjects1792108800002 } from "./1792108800002-create-projects";
import { CreateNegotiations1792108800003 } from "./1792108800003-create-negotiations";
import { CreateInvestments1792281600000 } from "./investments-1792281600000-create-investments";
import { CreateSettlements1792195200000 } from "./settlement-1792195200000-create-settlements";
import { AssistantCreateTables1792290000000 } from "./1792290000000-assistant-create-tables";

// Listed explicitly, in order, rather than globbed: a glob must match .ts under vitest and .js under nest's dist output,
// and a typo in it silently runs nothing. Every module's migrations live here so they share one ordered history.
export const MIGRATIONS = [
  CreateMilestones1792108800000,
  CreateGrants1792108800001,
  CreateProjects1792108800002,
  CreateNegotiations1792108800003,
  CreateSettlements1792195200000,
  CreateInvestments1792281600000,
  AssistantCreateTables1792290000000,
];
