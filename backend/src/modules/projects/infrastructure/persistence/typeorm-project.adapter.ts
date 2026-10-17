import type { DataSource } from "typeorm";
import type { Milestone } from "../../../milestones/application/milestone";
import { writeMilestone } from "../../../milestones/infrastructure/persistence/typeorm-milestone.adapter";
import { formatProjectCode, type NewProject, type Project, type ProjectStatus } from "../../application/project";
import { ProjectRepository } from "../../ports/project.repository";
import { ProjectEntity } from "./project.entity";

export const toProject = ({ seq: _, ...r }: ProjectEntity): Project => ({ ...r, currentStatus: r.currentStatus as ProjectStatus });

// RNF-04: the code, the project and every milestone with its lines commit together; a failure rolls the counter back too.
export class TypeOrmProjectAdapter extends ProjectRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  create(project: NewProject, milestones: Milestone[]) {
    return this.dataSource.transaction(async (manager) => {
      const year = project.createdAt.getUTCFullYear();
      // Row-locking upsert: concurrent creates in the same year serialize here and never share a number.
      const [{ last_value }] = await manager.query(
        `INSERT INTO project_code_sequences (year, last_value) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_value = project_code_sequences.last_value + 1
         RETURNING last_value`,
        [year],
      );
      const created: Project = { ...project, projectCode: formatProjectCode(year, Number(last_value)) };
      await manager.insert(ProjectEntity, created);
      for (const m of milestones) await writeMilestone(manager, m);
      return created;
    });
  }

  async findById(id: string) {
    const row = await this.dataSource.getRepository(ProjectEntity).findOneBy({ id });
    return row ? toProject(row) : null;
  }

  async findByOwner(ownerUserId: string) {
    const rows = await this.dataSource.getRepository(ProjectEntity).find({ where: { ownerUserId }, order: { seq: "ASC" } });
    return rows.map(toProject);
  }

  async updateStatus(id: string, status: ProjectStatus) {
    await this.dataSource.getRepository(ProjectEntity).update({ id }, { currentStatus: status });
  }
}
