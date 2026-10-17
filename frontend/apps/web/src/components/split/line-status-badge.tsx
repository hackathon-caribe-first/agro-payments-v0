import type { Tone } from "@agro/shared/modules/milestones/milestone-state";
import type { LineStatus } from "@agro/shared/modules/payment-lines/domain/line";
import type { SupplierStatus } from "@agro/shared/modules/payment-lines/domain/supplier";
import { StatusBadge } from "@agro/shared/ui/status-badge";

type Label = { label: string; tone: Tone; symbol: string };

const LINE_LABELS: Record<LineStatus, Label> = {
  pendiente: { label: "Pendiente", tone: "warning", symbol: "◷" },
  completado: { label: "Completado", tone: "success", symbol: "✓" },
  fallido: { label: "Fallido", tone: "danger", symbol: "✕" },
  en_cola: { label: "En cola", tone: "neutral", symbol: "⇄" },
  desconocido: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

const SUPPLIER_LABELS: Record<SupplierStatus, Label> = {
  validado: { label: "Billetera validada", tone: "success", symbol: "✓" },
  pendiente: { label: "En validación", tone: "warning", symbol: "◷" },
  rechazado: { label: "Billetera rechazada", tone: "danger", symbol: "✕" },
  desconocido: { label: "Estado desconocido", tone: "neutral", symbol: "○" },
};

export const LineStatusBadge = ({ status }: { status: LineStatus }) => <StatusBadge {...LINE_LABELS[status]} />;
export const SupplierStatusBadge = ({ status }: { status: SupplierStatus }) => <StatusBadge {...SUPPLIER_LABELS[status]} />;
