import { formatMoney } from "../../milestones/milestone-state";
import type { PdfDoc } from "./pdf";
import { PARTY_ROLE_LABEL, STATEMENT_STATUS_LABEL, type Statement, type StatementGroup, type StatementLine } from "./statement";

// The statement as the reader sees it: formatted strings in tables. The page and the PDF both render THIS, so the document on
// screen and the file always say the same thing.

export interface ViewColumn {
  header: string;
  align: "left" | "right";
  weight: number;
}

export interface ViewTable {
  id: StatementGroup;
  title: string;
  note: string | null;
  columns: ViewColumn[];
  rows: string[][];
  emptyText: string;
}

export interface ViewTotal {
  key: string;
  label: string;
  value: string;
  emphasis: boolean;
}

export interface StatementView {
  title: string;
  subtitle: string;
  meta: Array<[string, string]>;
  tables: ViewTable[];
  totals: ViewTotal[];
  // Plain-language notices (loss, partial position).
  notices: string[];
  fileName: string;
}

const dayFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export function formatStatementDay(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dayFormat.format(date);
}

export function formatStatementDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date);
}

const TITLE: Record<Statement["kind"], string> = {
  PRODUCER_FINAL: "Estado de cuenta final",
  INVESTOR_BALANCE: "Balance de inversión",
};

const slug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

export const statementFileName = (statement: Statement): string =>
  `${statement.kind === "PRODUCER_FINAL" ? "estado-de-cuenta" : "balance-de-inversion"}-${slug(statement.project.title) || statement.project.id}.pdf`;

const refText = (line: StatementLine): string => line.reference ?? "—";
const statusText = (line: StatementLine): string => (line.status ? STATEMENT_STATUS_LABEL[line.status] : "—");

interface TableSpec {
  id: StatementGroup;
  title: string;
  note?: string;
  emptyText: string;
  columns: ViewColumn[];
  row: (line: StatementLine, money: (n: number) => string) => string[];
}

const left = (header: string, weight: number): ViewColumn => ({ header, align: "left", weight });
const right = (header: string, weight: number): ViewColumn => ({ header, align: "right", weight });

const SPECS: Record<Statement["kind"], TableSpec[]> = {
  PRODUCER_FINAL: [
    {
      id: "SALE",
      title: "Ventas liquidadas",
      emptyText: "Todavía no hay ventas liquidadas.",
      columns: [left("Orden", 2), left("Comprador", 3), left("Fecha", 2), left("Estado", 1.5), right("Monto", 2.5)],
      row: (l, m) => [l.label, l.detail, formatStatementDay(l.at), statusText(l), m(l.amount)],
    },
    {
      id: "DISTRIBUTION",
      title: "Reparto de cada venta",
      note: "Se aplica en este orden: comisión de la Plataforma, capital del inversor, rendimiento pactado y, por último, la utilidad neta del productor.",
      emptyText: "Todavía no hay reparto de ventas.",
      columns: [left("Concepto", 3.5), left("Beneficiario", 2.5), left("Estado", 1.4), left("Comprobante", 2.6), right("Monto", 2.2)],
      row: (l, m) => [l.label, l.detail, statusText(l), refText(l), m(l.amount)],
    },
    {
      id: "LABOR",
      title: "Pagos de hitos recibidos (mano de obra)",
      emptyText: "No hay pagos de mano de obra registrados.",
      columns: [left("Hito", 3.5), left("Detalle", 2.5), left("Estado", 1.4), left("Comprobante", 2.6), right("Monto", 2.2)],
      row: (l, m) => [l.label, l.detail, statusText(l), refText(l), m(l.amount)],
    },
    {
      id: "SUPPLIER",
      title: "Pagos a proveedores hechos por tu cuenta",
      note: "El inversor pagó estas líneas directamente a cada proveedor desde su billetera, con el permiso de gasto de cada hito.",
      emptyText: "No hay pagos a proveedores registrados.",
      columns: [left("Hito", 3.5), left("Proveedor", 2.5), left("Estado", 1.4), left("Comprobante", 2.6), right("Monto", 2.2)],
      row: (l, m) => [l.label, l.detail, statusText(l), refText(l), m(l.amount)],
    },
  ],
  INVESTOR_BALANCE: [
    {
      id: "GRANT",
      title: "Permisos de gasto por hito",
      note: "Lo que no se gasta nunca salió de tu billetera: el saldo de cada permiso sigue ahí.",
      emptyText: "Todavía no hay permisos de gasto aprobados.",
      columns: [left("Hito", 3.4), left("Estado", 1.8), right("Tope", 2.2), right("Gastado", 2.2), right("Sigue en tu billetera", 2.4)],
      row: (l, m) => [l.label, l.detail, l.cap === null ? "—" : m(l.cap), m(l.amount), l.remaining === null ? "—" : m(l.remaining)],
    },
    {
      id: "RECEIVED",
      title: "Recibido de la venta",
      emptyText: "Todavía no hay pagos de la venta.",
      columns: [left("Concepto", 3.6), left("Estado", 1.4), left("Fecha", 1.8), left("Comprobante", 2.6), right("Monto", 2.2)],
      row: (l, m) => [l.label, statusText(l), formatStatementDay(l.at), refText(l), m(l.amount)],
    },
  ],
};

function notices(statement: Statement, money: (n: number) => string): string[] {
  const out: string[] = [];
  if (!statement.settled) {
    out.push(
      statement.kind === "INVESTOR_BALANCE"
        ? "El proyecto todavía no se liquida: este balance muestra tu posición parcial, con los permisos de gasto y lo gastado hasta hoy."
        : "El estado de cuenta estará disponible cuando se liquide el proyecto.",
    );
  }
  if (statement.shortfall > 0) {
    out.push(
      statement.kind === "INVESTOR_BALANCE"
        ? `La venta no cubrió el capital y el rendimiento pactados. Como se acordó en el contrato, el inversor asume la pérdida de ${money(statement.shortfall)} frente al capital y el rendimiento pactados. El resultado de este balance compara lo recibido con el capital invertido.`
        : `La venta no cubrió el capital y el rendimiento pactados. El inversor asume la pérdida de ${money(statement.shortfall)} y la utilidad neta del productor es ${money(0)}.`,
    );
  }
  return out;
}

export function toStatementView(statement: Statement): StatementView {
  const money = (n: number) => formatMoney(n, statement.project.currency);
  const period = statement.period;
  const tables = SPECS[statement.kind].map((spec): ViewTable => ({
    id: spec.id,
    title: spec.title,
    note: spec.note ?? null,
    columns: spec.columns,
    rows: statement.lines.filter((l) => l.group === spec.id).map((l) => spec.row(l, money)),
    emptyText: spec.emptyText,
  }));
  return {
    title: TITLE[statement.kind],
    subtitle: statement.project.title,
    meta: [
      ["Proyecto", `${statement.project.title}${statement.project.code ? ` (${statement.project.code})` : ""}`],
      ...statement.parties.map((p): [string, string] => [PARTY_ROLE_LABEL[p.role], p.name]),
      ["Período", `${formatStatementDay(period.from)} a ${period.to ? formatStatementDay(period.to) : "hoy"}`],
      ["Generado", formatStatementDateTime(statement.generatedAt)],
    ],
    tables,
    totals: statement.totals.map((t) => ({ key: t.key, label: t.label, value: t.text ?? money(t.amount), emphasis: t.emphasis })),
    notices: notices(statement, money),
    fileName: statementFileName(statement),
  };
}

// The PDF of a statement (see pdf.ts for the writer).
export function toPdfDoc(statement: Statement): PdfDoc {
  const view = toStatementView(statement);
  return {
    title: `${view.title} · ${statement.project.title}`,
    brand: "SURCO.",
    runningTitle: view.title,
    footer: `${statement.project.title} · generado el ${formatStatementDateTime(statement.generatedAt)}`,
    createdAt: statement.generatedAt,
    blocks: [
      { type: "text", text: view.title, bold: true, size: 18 },
      { type: "spacer", height: 6 },
      { type: "keyValues", rows: view.meta },
      ...view.notices.map((text) => ({ type: "text" as const, text, bold: true })),
      ...view.tables.flatMap((table) => [
        { type: "heading" as const, text: table.title },
        ...(table.note ? [{ type: "text" as const, text: table.note, muted: true }] : []),
        { type: "table" as const, columns: table.columns, rows: table.rows, emptyText: table.emptyText },
      ]),
      { type: "heading", text: "Totales" },
      { type: "totals", rows: view.totals.map((t) => ({ label: t.label, value: t.value, strong: t.emphasis })) },
    ],
  };
}
