import { redirect } from "react-router";

// LEGACY: the app used Spanish URLs before. Old paths (and their ?proyecto= / ?tipo= / ?unidad= query) are translated
// to the English equivalents, keeping ids. Only STRUCTURAL segments are translated, by position: an id that happens to
// equal a Spanish word (e.g. /comprador/preventas/nuevo) is left untouched. Lookups use Maps, never plain objects, so
// keys like "constructor" or "__proto__" are never resolved through the prototype chain.
const MODULES = new Map([
  ["productor", "producer"],
  ["comprador", "buyer"],
  ["verificador", "verifier"],
  ["custodio", "custodian"],
]);
const SECTIONS = new Map([
  ["proyectos", "projects"],
  ["solicitudes", "requests"],
  ["solicitudes-abiertas", "open-requests"],
  ["hitos", "milestones"],
  ["negociaciones", "negotiations"],
  // Buyers used to open a "preventa"; that is now the published project.
  ["preventas", "projects"],
]);
const QUERY_KEYS = new Map([
  ["proyecto", "project"],
  ["tipo", "type"],
  ["unidad", "unit"],
]);
const QUERY_VALUES = new Map([["todos", "all"]]);

function translatePath(pathname: string): string {
  const parts = pathname.split("/"); // ["", module, section, id?, extra?]
  const module = MODULES.get(parts[1] ?? "");
  if (!module) return pathname;
  parts[1] = module;
  const spanishSection = parts[2] ?? "";
  const section = SECTIONS.get(spanishSection);
  if (section) {
    parts[2] = section;
    // /productor/proyectos/nuevo and /productor/proyectos/:id/preventa; /comprador/solicitudes-abiertas/nueva.
    if (spanishSection === "proyectos" && parts[3] === "nuevo") parts[3] = "new";
    if (spanishSection === "proyectos" && parts[3] !== undefined && parts[4] === "preventa") parts[4] = "publication";
    if (module === "buyer" && spanishSection === "solicitudes-abiertas" && parts[3] === "nueva") parts[3] = "new";
  }
  return parts.join("/");
}

export function clientLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const search = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const translatedKey = QUERY_KEYS.get(key);
    search.append(translatedKey ?? key, translatedKey ? (QUERY_VALUES.get(value) ?? value) : value);
  }
  const query = search.toString();
  return redirect(`${translatePath(url.pathname)}${query ? `?${query}` : ""}`);
}
