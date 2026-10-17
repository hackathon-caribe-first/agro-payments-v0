import { ArrowLeft, Check, Mic, MicOff, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { ASSISTANT_NEEDS_SERVER, assistant, type AssistantIntent } from "~/producer/assistant";
import type { Route } from "./+types/producer.assistant";

export const meta = () => [{ title: "Asistente · Surco" }];

type ChatLine = { role: "user" | "assistant"; text: string };

const GREETING = "Hola. Puedo contarle cómo van sus proyectos, preparar un proyecto nuevo, registrar la evidencia de un hito o pedir insumos. ¿En qué le ayudo?";

// Web Speech API (native, no dependency). Chrome still ships it prefixed; the DOM lib has no types for it.
type Recognition = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;
const speechRecognition = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

function useDictation(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    setSupported(speechRecognition() !== null);
  }, []);

  const toggle = () => {
    if (listening) return recognition.current?.stop();
    const Ctor = speechRecognition();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "es-CO";
    r.interimResults = false;
    r.onresult = (event) => onText(Array.from(event.results, (result) => result[0].transcript).join(" "));
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };
  return { supported, listening, toggle };
}

export async function clientLoader() {
  if (ASSISTANT_NEEDS_SERVER) return { pin: null };
  const pin = await assistant.pinStatus();
  return { pin: pin.ok ? pin.value : null };
}

export default function ProducerAssistant({ loaderData }: Route.ComponentProps) {
  const [lines, setLines] = useState<ChatLine[]>([{ role: "assistant", text: GREETING }]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [intent, setIntent] = useState<AssistantIntent | null>(null);
  const [needsTechnician, setNeedsTechnician] = useState(false);
  const [pinSet, setPinSet] = useState(loaderData.pin?.pin_set ?? false);
  const [text, setText] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dictation = useDictation((spoken) => setText((current) => (current ? `${current} ${spoken}` : spoken)));
  const endRef = useRef<HTMLLIElement>(null);
  // Block body: newer browsers return a Promise from scrollIntoView, and an effect may only return a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  const say = (line: ChatLine) => setLines((current) => [...current, line]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    say({ role: "user", text: message });
    setText("");
    const result = await assistant.send(message, conversationId);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setConversationId(result.value.conversation_id);
    setNeedsTechnician(result.value.needs_technician);
    say({ role: "assistant", text: result.value.reply });
    setIntent(result.value.intent?.status === "pending" ? result.value.intent : null);
  }

  async function decide(confirm: boolean) {
    if (!intent || busy) return;
    setBusy(true);
    setError(null);
    if (confirm && intent.requires_pin && !pinSet) {
      const created = await assistant.setPin(pin);
      if (!created.ok) {
        setBusy(false);
        return setError(created.message);
      }
      setPinSet(true);
    }
    const result = confirm ? await assistant.confirm(intent.id, intent.requires_pin ? pin : undefined) : await assistant.reject(intent.id);
    setBusy(false);
    setPin("");
    if (!result.ok) return setError(result.message);
    say({ role: "user", text: confirm ? "Sí" : "No" });
    say({ role: "assistant", text: result.value.reply });
    setIntent(null);
  }

  const pinValid = /^\d{4}$/.test(pin);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-2">
        <Link to="/producer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Mis proyectos
        </Link>
        <h1 className="text-3xl text-primary">Asistente</h1>
        <p className="text-muted-foreground">Escriba o hable. El asistente prepara las solicitudes y usted las confirma; nunca mueve dinero por su cuenta.</p>
        <p className="self-start rounded-md bg-warning px-2 py-1 text-sm font-semibold text-warning-foreground">Entorno de simulación · Sin dinero real</p>
      </header>

      {ASSISTANT_NEEDS_SERVER && (
        <p role="status" className="rounded-lg border bg-card p-4 text-muted-foreground">
          El asistente necesita el servidor: inicie la aplicación con VITE_MILESTONES_SOURCE=http.
        </p>
      )}

      <ol aria-live="polite" className="flex min-h-64 flex-col gap-3 rounded-lg border bg-card p-4">
        {lines.map((line, i) => (
          <li
            key={i}
            className={
              line.role === "user"
                ? "max-w-[85%] self-end whitespace-pre-line rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                : "max-w-[85%] self-start whitespace-pre-line rounded-lg bg-secondary px-3 py-2 text-secondary-foreground"
            }
          >
            <span className="sr-only">{line.role === "user" ? "Usted: " : "Asistente: "}</span>
            {line.text}
          </li>
        ))}
        {busy && <li className="self-start text-sm text-muted-foreground">El asistente está escribiendo…</li>}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      {needsTechnician && (
        <p role="status" className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          ⚠ Un técnico revisará esta conversación y lo llamará.
        </p>
      )}

      {intent && (
        <section aria-labelledby="intent-title" className="flex flex-col gap-3 rounded-lg border-2 border-primary bg-card p-4">
          <h2 id="intent-title" className="font-brand text-lg font-bold text-primary">
            ¿Confirma esta solicitud?
          </h2>
          <p className="tabular-nums">{intent.summary}</p>
          {intent.requires_pin && (
            <div className="flex flex-col gap-1">
              <label htmlFor="pin" className="text-sm font-semibold">
                {pinSet ? "Su PIN de 4 dígitos" : "Cree su PIN de 4 dígitos (lo usará para confirmar cada orden)"}
              </label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="h-11 w-32 tabular-nums tracking-[0.5em]"
              />
              <p className="text-sm text-muted-foreground">El pago no sale hasta que el operador apruebe la orden.</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => decide(true)} disabled={busy || (intent.requires_pin && !pinValid)}>
              <Check aria-hidden="true" />
              Sí, confirmar
            </Button>
            <Button type="button" variant="outline" onClick={() => decide(false)} disabled={busy}>
              <X aria-hidden="true" />
              No, cancelar
            </Button>
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-destructive">
          ✕ {error}
        </p>
      )}

      <form onSubmit={send} className="flex items-center gap-2">
        <label htmlFor="message" className="sr-only">
          Mensaje para el asistente
        </label>
        <Input
          id="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Por ejemplo: ¿cuánto me falta?"
          autoComplete="off"
          maxLength={2000}
          className="h-11 flex-1"
          disabled={ASSISTANT_NEEDS_SERVER}
        />
        {dictation.supported && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11"
            onClick={dictation.toggle}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? "Dejar de escuchar" : "Hablar"}
            disabled={ASSISTANT_NEEDS_SERVER}
          >
            {dictation.listening ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>
        )}
        <Button type="submit" className="h-11" disabled={busy || !text.trim() || ASSISTANT_NEEDS_SERVER}>
          <Send aria-hidden="true" />
          Enviar
        </Button>
      </form>
    </div>
  );
}
