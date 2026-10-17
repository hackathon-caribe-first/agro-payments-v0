import { err, ok } from "../../milestones/domain/errors";
import { attempt } from "../../milestones/application/use-cases";
import type { PaymentAuthorization } from "../domain/authorization";
import type { PaymentAuthorizationRepository } from "./payment-authorization-repository";

// Newest first.
export const getProjectAuthorizations = (repo: PaymentAuthorizationRepository, projectId: string) =>
  attempt<PaymentAuthorization[]>(async () => {
    const authorizations = await repo.listProjectAuthorizations(projectId);
    if (!authorizations) return err({ kind: "not_found" });
    return ok([...authorizations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
