import { useRevalidator } from "react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@agro/shared/ui/button";

// In-page panel for the screens that talk to the real payments server: shown inside the normal layout.
export function ServerUnreachable({ title, message }: { title: string; message: string }) {
  const { revalidate, state } = useRevalidator();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl text-primary">{title}</h1>
      </header>
      <section role="alert" className="flex flex-col items-start gap-4 rounded-lg border border-destructive bg-card p-5">
        <p className="text-foreground">{message}</p>
        <Button type="button" size="sm" variant="outline" onClick={() => revalidate()} disabled={state === "loading"}>
          <RefreshCw aria-hidden="true" />
          Reintentar
        </Button>
      </section>
    </div>
  );
}
