import { Injectable } from "@nestjs/common";
import { submitEvidence } from "./milestone";
import { MilestoneStore } from "./milestone-store";

@Injectable()
export class SubmitEvidenceUseCase {
  constructor(private readonly store: MilestoneStore) {}

  execute(id: string, description: string) {
    return this.store.update(id, (m) => submitEvidence(m, description, new Date()));
  }
}
