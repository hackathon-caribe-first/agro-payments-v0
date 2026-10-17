import type { RequestEntry } from "@agro/shared/modules/presales/application/use-cases";
import { originLabel } from "./origin";

// What a negotiation in a list is about: the whole project, one milestone, or an open request.
export function scopeKicker(entry: Pick<RequestEntry, "request" | "milestoneTitle">): string {
  const { request, milestoneTitle } = entry;
  if (request.scope === "MILESTONE") return `Hito · ${milestoneTitle ?? "Hito"}`;
  if (request.scope === "PROJECT") return "Negociación del proyecto";
  return originLabel(request.origin);
}

// The title of a list item: the project the negotiation is about.
export const entryTitle = (entry: Pick<RequestEntry, "projectTitle">): string => entry.projectTitle || "Proyecto";
