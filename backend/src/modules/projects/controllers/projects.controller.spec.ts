import { EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { ApiErrorFilter } from "../../../shared/api-error.filter";
import { ProducerMilestonesController } from "./producer-milestones.controller";
import { ProjectsController } from "./projects.controller";

type Controller = typeof ProjectsController | typeof ProducerMilestonesController;
const meta = (key: string, controller: Controller, handler?: string) =>
  Reflect.getMetadata(key, handler ? (controller.prototype as unknown as Record<string, object>)[handler] : controller);
const route = (controller: Controller, handler: string) => [
  RequestMethod[meta(METHOD_METADATA, controller, handler)],
  `${meta(PATH_METADATA, controller)}/${meta(PATH_METADATA, controller, handler)}`,
];

const READERS = ["seller", "admin", "fidu", "investor"];
const PRODUCERS = ["seller", "admin"];

describe.each([ProjectsController, ProducerMilestonesController])("%o access control", (controller) => {
  it("uses ApiAuthGuard (session or DEMO_IDENTITY) then RolesGuard, and the /api error body", () => {
    expect(meta(GUARDS_METADATA, controller)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(EXCEPTION_FILTERS_METADATA, controller)).toEqual([ApiErrorFilter]);
  });

  it("lets seller, admin, fidu and investor read; buyer gets 403", () => {
    expect(meta(ROLES_KEY, controller)).toEqual(READERS);
  });
});

describe("ProjectsController routes", () => {
  it("serves the web app's project paths under /api", () => {
    expect(route(ProjectsController, "listProducerProjects")).toEqual(["GET", "api/producer/projects"]);
    expect(route(ProjectsController, "getProject")).toEqual(["GET", "api/projects/:projectId"]);
    expect(route(ProjectsController, "createProject")).toEqual(["POST", "api/projects"]);
    expect(route(ProjectsController, "listMilestones")).toEqual(["GET", "api/projects/:projectId/milestones"]);
  });

  it("restricts the producer endpoints to seller and admin", () => {
    expect(meta(ROLES_KEY, ProjectsController, "listProducerProjects")).toEqual(PRODUCERS);
    expect(meta(ROLES_KEY, ProjectsController, "createProject")).toEqual(PRODUCERS);
    expect(meta(ROLES_KEY, ProjectsController, "getProject")).toBeUndefined();
    expect(meta(ROLES_KEY, ProjectsController, "listMilestones")).toBeUndefined();
  });

  it("answers 201 on create", () => {
    expect(meta(HTTP_CODE_METADATA, ProjectsController, "createProject")).toBe(201);
  });
});

describe("ProducerMilestonesController routes", () => {
  it("serves the web app's milestone paths under /api", () => {
    expect(route(ProducerMilestonesController, "getMilestone")).toEqual(["GET", "api/milestones/:id"]);
    expect(route(ProducerMilestonesController, "addLog")).toEqual(["POST", "api/milestones/:id/logs"]);
    expect(route(ProducerMilestonesController, "submit")).toEqual(["POST", "api/milestones/:id/submit"]);
  });

  it("restricts logs and submission to seller and admin; 201 for a log, 200 for submit", () => {
    expect(meta(ROLES_KEY, ProducerMilestonesController, "addLog")).toEqual(PRODUCERS);
    expect(meta(ROLES_KEY, ProducerMilestonesController, "submit")).toEqual(PRODUCERS);
    expect(meta(HTTP_CODE_METADATA, ProducerMilestonesController, "addLog")).toBe(201);
    expect(meta(HTTP_CODE_METADATA, ProducerMilestonesController, "submit")).toBe(200);
  });
});
