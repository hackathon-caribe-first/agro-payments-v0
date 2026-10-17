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
    // v3: the fiduciaria reads the milestones whose grants it approves (custodian screen).
    expect(classRoles).toEqual([MILESTONE_ROLES.verifier, MILESTONE_ROLES.fiduciaria, MILESTONE_ROLES.producer, MILESTONE_ROLES.operator]);
    expect(classRoles).not.toContain("buyer");
    expect(handlerRoles("list")).toBeUndefined();
    expect(handlerRoles("get")).toBeUndefined();
  });

  it("restricts evidence to the producer", () => {
    expect(handlerRoles("addEvidence")).toEqual([MILESTONE_ROLES.producer]);
  });

  // PRD v3 actors and principle 4: the technical verifier issues the verdict and is not the fiduciaria, which only approves grants.
  it("restricts review to the verifier, never the fiduciaria", () => {
    expect(handlerRoles("review")).toEqual([MILESTONE_ROLES.verifier]);
    expect(handlerRoles("review")).not.toContain("fidu");
  });

  it("restricts line payment and sync to the operator", () => {
    expect(handlerRoles("payLine")).toEqual([MILESTONE_ROLES.operator]);
    expect(handlerRoles("sync")).toEqual([MILESTONE_ROLES.operator]);
  });

  it("exposes line payment and sync under the milestone", () => {
    expect(path("payLine")).toBe(":id/lines/:lineId/payment");
    expect(path("sync")).toBe(":id/lines/sync");
  });

  // v3 (RF-13): the fiduciaria approves the milestone grant on custody (operator as demo fallback); investors no longer fund milestones.
  it("lets the fiduciaria and the operator start a milestone grant, not the investor", () => {
    expect(handlerRoles("startFunding")).toEqual([MILESTONE_ROLES.fiduciaria, MILESTONE_ROLES.operator]);
    expect(handlerRoles("startFunding")).not.toContain("investor");
    expect(path("startFunding")).toBe(":id/funding");
  });

  // v3: the verifier gets its own role (was fidu); fidu is the fiduciaria.
  it("maps the roles to verifier, fidu, seller, admin and investor", () => {
    expect(MILESTONE_ROLES).toEqual({ verifier: "verifier", fiduciaria: "fidu", producer: "seller", operator: "admin", investor: "investor" });
  });
});
