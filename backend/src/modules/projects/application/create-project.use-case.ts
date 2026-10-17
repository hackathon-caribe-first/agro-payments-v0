import { randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { ProjectRepository } from "../ports/project.repository";
import { ProducerWalletCheck } from "./producer-wallet";
import { buildProject, type NewProjectInput, type Viewer } from "./project";
import { PROJECT_WALLETS, type ProjectWallets } from "./project-wallets";

@Injectable()
export class CreateProjectUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    @Inject(PROJECT_WALLETS) private readonly wallets: ProjectWallets,
    @Optional() private readonly walletCheck?: ProducerWalletCheck,
  ) {}

  /** The owner is always the caller: producer ids in the body are never trusted. */
  async execute(owner: Viewer, input: NewProjectInput) {
    const { project, milestones } = buildProject({ id: randomUUID(), ownerUserId: owner.id, input, wallets: this.wallets, now: new Date() });
    // RF-01: shape first (400 on every field at once), then the wallet's GET, then the write.
    if (project.producerWalletAddress && this.walletCheck) await this.walletCheck.verify(project.producerWalletAddress);
    return this.projects.create(project, milestones);
  }
}
