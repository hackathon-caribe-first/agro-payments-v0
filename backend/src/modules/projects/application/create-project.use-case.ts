import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ProjectRepository } from "../ports/project.repository";
import { buildProject, type NewProjectInput, type Viewer } from "./project";
import { PROJECT_WALLETS, type ProjectWallets } from "./project-wallets";

@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    @Inject(PROJECT_WALLETS) private readonly wallets: ProjectWallets,
  ) {}

  /** The owner is always the caller: producer ids in the body are never trusted. */
  async execute(owner: Viewer, input: NewProjectInput) {
    const { project, milestones } = buildProject({ id: randomUUID(), ownerUserId: owner.id, input, wallets: this.wallets, now: new Date() });
    return this.projects.create(project, milestones);
  }
}
