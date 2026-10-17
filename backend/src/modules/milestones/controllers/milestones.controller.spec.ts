import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "../../auth/controllers/auth.guard";
import { ROLES_KEY } from "../../auth/controllers/roles.decorator";
import { RolesGuard } from "../../auth/controllers/roles.guard";
import { MILESTONE_ROLES } from "./milestone-roles";
import { MilestonesController } from "./milestones.controller";

const proto = MilestonesController.prototype;
const classRoles = Reflect.getMetadata(ROLES_KEY, MilestonesController);
const handlerRoles = (name: keyof MilestonesController) => Reflect.getMetadata(ROLES_KEY, proto[name]);
const path = (name: keyof MilestonesController) => Reflect.getMetadata("path", proto[name]);

describe("MilestonesController access control", () => {
  it("applies AuthGuard then RolesGuard to the whole class, so no session means 401", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MilestonesController)).toEqual([AuthGuard, RolesGuard]);
  });

  it("lets every milestone role read, and nobody else (a buyer gets 403)", () => {
    expect(classRoles).toEqual([MILESTONE_ROLES.verifier, MILESTONE_ROLES.producer, MILESTONE_ROLES.operator]);
    expect(classRoles).not.toContain("buyer");
    expect(handlerRoles("list")).toBeUndefined();
    expect(handlerRoles("get")).toBeUndefined();
  });

  it("restricts evidence to the producer", () => {
    expect(handlerRoles("addEvidence")).toEqual([MILESTONE_ROLES.producer]);
  });

  it("restricts review to the verifier", () => {
    expect(handlerRoles("review")).toEqual([MILESTONE_ROLES.verifier]);
  });

  it("restricts line payment and sync to the operator", () => {
    expect(handlerRoles("payLine")).toEqual([MILESTONE_ROLES.operator]);
    expect(handlerRoles("sync")).toEqual([MILESTONE_ROLES.operator]);
  });

  it("exposes line payment and sync under the milestone", () => {
    expect(path("payLine")).toBe(":id/lines/:lineId/payment");
    expect(path("sync")).toBe(":id/lines/sync");
  });

  it("maps the roles to fidu, seller and admin", () => {
    expect(MILESTONE_ROLES).toEqual({ verifier: "fidu", producer: "seller", operator: "admin" });
  });
});
