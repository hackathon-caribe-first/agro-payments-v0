import { Fingerprint, LocateFixed, X } from "lucide-react";
import { useState } from "react";
import { sha256Hex } from "@agro/shared/lib/sha256";
import type { EvidenceLocation } from "@agro/shared/modules/milestones/domain/milestone";
import { Button } from "@agro/shared/ui/button";

/** sha256 (64 lowercase hex) per photo URL of the log being written. */
export type PhotoHashes = Record<string, string>;

const LOCATION_STATUS = { IDLE: "idle", LOCATING: "locating", DENIED: "denied", UNAVAILABLE: "unavailable", TIMEOUT: "timeout" } as const;
type LocationStatus = (typeof LOCATION_STATUS)[keyof typeof LOCATION_STATUS];

const LOCATION_PROBLEM: Partial<Record<LocationStatus, string>> = {
  denied: "No diste permiso para usar tu ubicación. Actívalo en la configuración del navegador o guarda el registro sin ubicación.",
  unavailable: "Este dispositivo no pudo darnos la ubicación. Puedes guardar el registro sin ella.",
  timeout: "La ubicación se demoró demasiado. Intenta otra vez a cielo abierto o guarda el registro sin ella.",
};

// ~11 cm: more decimals add noise, not precision.
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const coordinate = (n: number) => n.toLocaleString("es-CO", { minimumFractionDigits: 5, maximumFractionDigits: 6 });

const FIELD_ERROR_CLASS = "text-sm font-semibold text-destructive";

// RF-19/RF-35: optional location of the log through the browser's Geolocation API (https or localhost only).
export function LocationField({
  location,
  onChange,
  errors,
}: {
  location: EvidenceLocation | null;
  onChange: (location: EvidenceLocation | null) => void;
  errors?: string[];
}) {
  const [status, setStatus] = useState<LocationStatus>(LOCATION_STATUS.IDLE);
  const problem = LOCATION_PROBLEM[status];

  const locate = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus(LOCATION_STATUS.UNAVAILABLE);
      return;
    }
    setStatus(LOCATION_STATUS.LOCATING);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({ latitude: round6(position.coords.latitude), longitude: round6(position.coords.longitude) });
        setStatus(LOCATION_STATUS.IDLE);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setStatus(LOCATION_STATUS.DENIED);
        else if (error.code === error.TIMEOUT) setStatus(LOCATION_STATUS.TIMEOUT);
        else setStatus(LOCATION_STATUS.UNAVAILABLE);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-invalid={errors ? true : undefined} aria-describedby={errors ? "log-location-error" : undefined}>
      <legend className="text-sm font-medium">
        Ubicación del registro <span className="text-muted-foreground">(opcional)</span>
      </legend>
      {location && (
        <p className="text-sm">
          <span aria-hidden="true">✓ </span>
          Latitud <span className="font-semibold tabular-nums">{coordinate(location.latitude)}</span>, longitud{" "}
          <span className="font-semibold tabular-nums">{coordinate(location.longitude)}</span>
          <input type="hidden" name="latitude" value={location.latitude} />
          <input type="hidden" name="longitude" value={location.longitude} />
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={locate} disabled={status === LOCATION_STATUS.LOCATING}>
          <LocateFixed aria-hidden="true" />
          {status === LOCATION_STATUS.LOCATING ? "Buscando tu ubicación…" : location ? "Actualizar ubicación" : "Usar mi ubicación"}
        </Button>
        {location && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            <X aria-hidden="true" />
            Quitar ubicación
          </Button>
        )}
      </div>
      <p role="status" className={problem ? "rounded-md bg-warning px-3 py-2 text-sm text-warning-foreground" : "sr-only"}>
        {problem && <span aria-hidden="true">⚠ </span>}
        {problem ?? (status === LOCATION_STATUS.LOCATING ? "Buscando tu ubicación…" : "")}
      </p>
      {errors && (
        <p id="log-location-error" role="alert" className={FIELD_ERROR_CLASS}>
          ✕ {errors.join(" ")}
        </p>
      )}
    </fieldset>
  );
}

const shortHash = (sha256: string) => `${sha256.slice(0, 12)}…${sha256.slice(-6)}`;

// Reads the picked file locally (FileReader-free: Blob.arrayBuffer) and hashes it with Web Crypto; nothing is uploaded.
export function PhotoHashPicker({ url, sha256, onHash }: { url: string; sha256?: string; onHash: (url: string, sha256: string | null) => void }) {
  const [state, setState] = useState<"idle" | "hashing" | "error">("idle");
  const inputId = `hash-${url.replace(/[^a-z0-9]+/gi, "-")}`;
  const name = url.split("/").pop() ?? url;

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setState("hashing");
    try {
      onHash(url, await sha256Hex(await file.arrayBuffer()));
      setState("idle");
    } catch {
      setState("error");
    } finally {
      // Lets the producer pick the same file again.
      input.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1.5 pl-6">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border-2 border-primary bg-card px-4 font-brand text-sm font-bold text-primary hover:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2"
        >
          <Fingerprint aria-hidden="true" className="size-4" />
          {state === "hashing" ? "Calculando huella…" : sha256 ? "Cambiar archivo" : "Elegir archivo para la huella"}
          <span className="sr-only"> de {name}</span>
          <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={pick} disabled={state === "hashing"} />
        </label>
        {sha256 && (
          <Button type="button" variant="ghost" onClick={() => onHash(url, null)}>
            <X aria-hidden="true" />
            Quitar huella<span className="sr-only"> de {name}</span>
          </Button>
        )}
      </div>
      {sha256 && (
        <p className="text-sm text-muted-foreground">
          <span aria-hidden="true">✓ </span>Huella SHA-256: <span className="break-all tabular-nums" title={sha256}>{shortHash(sha256)}</span>
        </p>
      )}
      {state === "error" && (
        <p role="alert" className={FIELD_ERROR_CLASS}>
          ✕ No pudimos calcular la huella en este navegador. Abre la app con https o guarda el registro sin huella.
        </p>
      )}
    </div>
  );
}
