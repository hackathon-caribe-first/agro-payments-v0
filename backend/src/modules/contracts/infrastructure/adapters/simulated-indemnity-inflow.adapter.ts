import { IndemnityInflow } from "../../ports/indemnity-inflow";

// ponytail: no wallet, so nothing to pay into; the fiduciaria confirms the indemnity by hand.
export class SimulatedIndemnityInflow extends IndemnityInflow {
  async request() {
    return null;
  }

  async received() {
    return 0;
  }
}
