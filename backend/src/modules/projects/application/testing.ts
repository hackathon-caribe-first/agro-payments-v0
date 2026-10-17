// Test doubles shared by the project use case specs.
import type { Milestone } from "../../milestones/application/milestone";
import type { MilestoneRepository } from "../../milestones/ports/milestone.repository";
import { ProjectRepository } from "../ports/project.repository";
import { formatProjectCode, type NewProject, type Project, type ProjectStatus } from "./project";

export class FakeProjectRepository extends ProjectRepository {
  private readonly projects: Project[] = [];
  private readonly sequences = new Map<number, number>();

  constructor(private readonly milestones: MilestoneRepository) {
    super();
  }

  async create(project: NewProject, milestones: Milestone[]) {
    const year = project.createdAt.getUTCFullYear();
    const n = (this.sequences.get(year) ?? 0) + 1;
    this.sequences.set(year, n);
    const created = { ...project, projectCode: formatProjectCode(year, n) };
    this.projects.push(created);
    for (const m of milestones) await this.milestones.save(m);
    return created;
  }

  async findById(id: string) {
    return this.projects.find((p) => p.id === id) ?? null;
  }

  async findByOwner(ownerUserId: string) {
    return this.projects.filter((p) => p.ownerUserId === ownerUserId);
  }

  async findAll() {
    return [...this.projects];
  }

  async updateStatus(id: string, status: ProjectStatus) {
    const project = this.projects.find((p) => p.id === id);
    if (project) project.currentStatus = status;
  }
}
