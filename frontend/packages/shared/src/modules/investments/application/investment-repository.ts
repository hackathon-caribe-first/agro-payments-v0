import type { InvestorProject, Investment } from "../domain/investment";
import type { InvestInput } from "../schemas/invest";

// Port for the investor side. Implementations throw BoundaryError, NetworkError or ValidationFailure (400/409).
export interface InvestmentRepository {
  listFundable(): Promise<InvestorProject[]>;
  // Null when the project does not exist (or the caller cannot see it).
  getProject(projectId: string): Promise<InvestorProject | null>;
  listInvestments(projectId: string): Promise<Investment[]>;
  invest(projectId: string, input: InvestInput): Promise<Investment>;
}
