import { redirect } from "react-router";

// LEGACY: the app used Spanish URLs before. Old paths (and their ?proyecto= / ?tipo= / ?unidad= query) are translated
// to the English equivalents, keeping ids. Only STRUCTURAL segments are translated, by position: an id that happens to
// equal a Spanish word (e.g. /comprador/solicitudes/nuevo) is left untouched. Lookups use Maps, never plain objects, so
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
]);
const QUERY_KEYS = new Map([
  ["proyecto", "project"],
  ["tipo", "type"],
  ["unidad", "unit"],
]);
const QUERY_VALUES = new Map([["todos", "all"]]);

interface Target {
  pathname: string;
  // Query params the translation itself adds (e.g. the project of a former publication page).
  extra?: Record<string, string>;
}

function translatePath(pathname: string): Target {
  const parts = pathname.split("/"); // ["", module, section, id?, extra?]
  const module = MODULES.get(parts[1] ?? "");
  if (!module) return { pathname };
  parts[1] = module;

  // Presales no longer exist: buyers browse projects, producers see their negotiations.
  if (module === "buyer" && parts[2] === "preventas") return { pathname: "/buyer" };
  if (module === "producer" && parts[2] === "proyectos" && parts[3] !== undefined && parts[4] === "preventa") {
    return { pathname: "/producer/negotiations", extra: { project: parts[3] } };
  }

  // Positional: only /productor/proyectos/:id/publicacion (the id itself is never translated).
  if (module === "producer" && parts[2] === "proyectos" && parts[3] !== undefined && parts[4] === "publicacion") {
    parts[2] = "projects";
    parts[4] = "publication";
    return { pathname: parts.join("/") };
  }

  const spanishSection = parts[2] ?? "";
  const section = SECTIONS.get(spanishSection);
  if (section) {
    parts[2] = section;
    // /productor/proyectos/nuevo and /comprador/solicitudes-abiertas/nueva.
    if (spanishSection === "proyectos" && parts[3] === "nuevo") parts[3] = "new";
    if (module === "buyer" && spanishSection === "solicitudes-abiertas" && parts[3] === "nueva") parts[3] = "new";
  }
  return { pathname: parts.join("/") };
}

export function clientLoader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const target = translatePath(url.pathname);
  const search = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    const translatedKey = QUERY_KEYS.get(key);
    search.append(translatedKey ?? key, translatedKey ? (QUERY_VALUES.get(value) ?? value) : value);
  }
  for (const [key, value] of Object.entries(target.extra ?? {})) search.set(key, value);
  const query = search.toString();
  return redirect(`${target.pathname}${query ? `?${query}` : ""}`);
}
