import type { DataSource } from "typeorm";
import { custodyAvailable } from "../../../harvest/domain/panel";
import { TypeOrmProjectAdapter } from "../../../projects/infrastructure/persistence/typeorm-project.adapter";
import { TypeOrmSettlementAdapter } from "../../../settlement/infrastructure/persistence/typeorm-settlement.adapter";
import { type CustodyStanding, ProjectCustody } from "../../ports/project-custody";
import { TypeOrmMilestoneAdapter } from "./typeorm-milestone.adapter";

// RF-05 read side over the owning modules' adapters: the project's status and the RF-21 custody balance (one formula, panel.ts).
export class TypeOrmProjectCustody extends ProjectCustody {
  private readonly projects: TypeOrmProjectAdapter;
  private readonly milestones: TypeOrmMilestoneAdapter;
  private readonly settlements: TypeOrmSettlementAdapter;

  constructor(dataSource: DataSource) {
    super();
    this.projects = new TypeOrmProjectAdapter(dataSource);
    this.milestones = new TypeOrmMilestoneAdapter(dataSource);
    this.settlements = new TypeOrmSettlementAdapter(dataSource);
  }

  async standing(projectId: string): Promise<CustodyStanding | null> {
    const project = await this.projects.findById(projectId);
    if (!project) return null;
    const [milestones, settlements] = await Promise.all([this.milestones.findByProject(projectId), this.settlements.findByProject(projectId)]);
    return { status: project.currentStatus, available: custodyAvailable(project, milestones, settlements) };
  }
}
