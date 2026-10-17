import type { LogType, ReviewVerdict } from "@agro/shared/modules/milestones/domain/milestone";
import type { ActorRole } from "@agro/shared/modules/reviews/domain/review";

const dateTime = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

// Decimal comma, five decimals: enough precision to locate a plot.
export const formatCoordinate = (value: number) => value.toFixed(5).replace(".", ",");

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  PHOTO_EVIDENCE: "Evidencia fotográfica",
  SOIL_ANALYSIS: "Análisis de suelo",
  IOT_READING: "Lectura de sensor",
  WEATHER_ALERT: "Alerta climática",
  AGRONOMIC_NOTE: "Nota agronómica",
};

export const VERDICT_LABELS: Record<ReviewVerdict, string> = {
  SUBMITTED: "Enviado a revisión",
  CHANGES_REQUESTED: "Dictamen observado",
  APPROVED_FAVORABLE: "Dictamen aprobado",
  PAYOUT_EXECUTED: "Pago ejecutado",
};

export const ROLE_LABELS: Record<ActorRole, string> = {
  PRODUCER: "Productor",
  VERIFIER: "Verificador",
  INVESTOR: "Inversor",
  PLATFORM: "Plataforma",
};
