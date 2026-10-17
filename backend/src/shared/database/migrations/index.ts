import { CreateMilestones1792108800000 } from "./1792108800000-create-milestones";
import { CreateGrants1792108800001 } from "./1792108800001-create-grants";
import { CreateProjects1792108800002 } from "./1792108800002-create-projects";

// Listed explicitly, in order, rather than globbed: a glob must match .ts under vitest and .js under nest's dist output,
// and a typo in it silently runs nothing. Every module's migrations live here so they share one ordered history.
export const MIGRATIONS = [CreateMilestones1792108800000, CreateGrants1792108800001, CreateProjects1792108800002];
