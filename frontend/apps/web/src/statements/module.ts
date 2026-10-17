import { createStatementsModule } from "@agro/shared/modules/statements/infrastructure/statements-module";
import { API_BASE_URL, prototypeTransport } from "~/platform/transport";

// The statements only read, through the shared transport: project, settlements, milestone payment lines, grants and contract.
export const statements = createStatementsModule({ fetchFn: prototypeTransport, baseUrl: API_BASE_URL });
