import { RequestMethod } from "@nestjs/common";
import { GUARDS_METADATA, HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ValidationError } from "../../../shared/domain-errors";
import { ApiAuthGuard } from "../../auth/controllers/api-auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { ADMISSION_BLOCKS, admissionOutcome } from "../application/admission";
import { ELIMINATION_FILTERS } from "../application/motor";
import { AdmissionController, parseAdmissionRequest, toAdmissionResponse } from "./admission.controller";

const meta = (key: string, handler?: string) =>
  Reflect.getMetadata(key, handler ? (AdmissionController.prototype as unknown as Record<string, object>)[handler] : AdmissionController);

describe("AdmissionController (RF-02/RF-03)", () => {
  it("serves POST and GET /api/projects/:projectId/admission; producer, operator and verifier assess", () => {
    expect(meta(GUARDS_METADATA)).toEqual([ApiAuthGuard, RolesGuard]);
    expect(meta(PATH_METADATA)).toBe("api/projects/:projectId/admission");
    expect(RequestMethod[meta(METHOD_METADATA, "assess")]).toBe("POST");
    expect(RequestMethod[meta(METHOD_METADATA, "latest")]).toBe("GET");
    expect(meta(ROLES_KEY, "assess")).toEqual(["seller", "admin", "verifier"]);
    expect(meta(HTTP_CODE_METADATA, "assess")).toBe(201);
  });

  it("refuses a body without blocks as a form-level 400", () => {
    expect(() => parseAdmissionRequest({ filters: [] })).toThrow(ValidationError);
  });

  it("answers snake_case", () => {
    const filters = ELIMINATION_FILTERS.map((name) => ({ name, passes: true, evidence: "ok" }));
    const blocks = Object.fromEntries(ADMISSION_BLOCKS.map((b) => [b, 65])) as Record<(typeof ADMISSION_BLOCKS)[number], number>;
    const response = toAdmissionResponse({
      id: "a1",
      projectId: "p1",
      filters,
      blocks,
      outcome: admissionOutcome({ filters, blocks }),
      motorVersion: "surco-motor@1.0.0",
      createdBy: "v1",
      createdAt: new Date("2026-10-17T00:00:00Z"),
    });
    expect(response).toMatchObject({ project_id: "p1", admitted: true, level: "B", milestones: 3, financeable_pct: { min: 70, max: 80 }, labor_line: true, created_at: "2026-10-17T00:00:00.000Z" });
  });
});
