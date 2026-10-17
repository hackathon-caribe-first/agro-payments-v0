import type { DataSource } from "typeorm";
import { TypeOrmInvestmentStore } from "../../../investments/infrastructure/persistence/typeorm-investment-store.adapter";
import { TypeOrmSettlementAdapter } from "../../../settlement/infrastructure/persistence/typeorm-settlement.adapter";
import { TypeOrmSimulationRunAdapter } from "../../../simulation/infrastructure/persistence/typeorm-simulation-run.adapter";
import { PanelSources } from "../../ports/panel-sources";

// RF-27 read side over the owning modules' own adapters (read methods only), so the panel never re-reads their tables by hand.
export class TypeOrmPanelSources extends PanelSources {
  private readonly investmentStore: TypeOrmInvestmentStore;
  private readonly settlementStore: TypeOrmSettlementAdapter;
  private readonly simulationStore: TypeOrmSimulationRunAdapter;

  constructor(dataSource: DataSource) {
    super();
    this.investmentStore = new TypeOrmInvestmentStore(dataSource);
    this.settlementStore = new TypeOrmSettlementAdapter(dataSource);
    this.simulationStore = new TypeOrmSimulationRunAdapter(dataSource);
  }

  investments(projectId: string) {
    return this.investmentStore.listByProject(projectId);
  }

  settlements(projectId: string) {
    return this.settlementStore.findByProject(projectId);
  }

  latestSimulation(projectId: string) {
    return this.simulationStore.findLatest(projectId);
  }
}
