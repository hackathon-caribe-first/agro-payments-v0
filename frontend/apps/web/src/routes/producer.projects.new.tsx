import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { ProjectForm, type CreateProjectActionData } from "~/components/producer/project-form/project-form";
import type { WalletCheckActionData } from "~/components/producer/project-form/wallet-field";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/producer.projects.new";

export const meta = () => [{ title: "Nuevo proyecto · Surco" }];

export async function clientAction({ request }: Route.ClientActionArgs): Promise<CreateProjectActionData | WalletCheckActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();

  // RF-01: "Validar billetera" (a fetcher of the form). Nothing is saved.
  if (form.get("intent") === "validate-wallet") {
    const checked = String(form.get("producerWallet") ?? "").trim();
    const wallet = await producer.validateProducerWallet(checked);
    if (wallet.ok) return { checked, fieldErrors: {}, wallet: wallet.value };
    if (wallet.error.kind === "validation") return { checked, fieldErrors: wallet.error.fieldErrors };
    return { checked, fieldErrors: { producerWallet: [errorMessage(wallet.error)] } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { fieldErrors: { [FORM_LEVEL_KEY]: ["No pudimos leer el formulario. Recarga la página e intenta de nuevo."] } };
  }

  // The form requires the producer wallet (RF-01); it is validated again before saving.
  const result = await producer.createProject(raw, { requireProducerWallet: true });
  if (result.ok) return redirect(`/producer/projects/${result.value.id}`);

  if (result.error.kind === "validation") return { fieldErrors: result.error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [errorMessage(result.error)] } };
}

export default function NewProject({ actionData }: Route.ComponentProps) {
  // Only the creation answers reach the form; the wallet check belongs to its own fetcher.
  const created = actionData && !("checked" in actionData) ? actionData : undefined;
  return (
    <div className="flex flex-col gap-6">
      <Link to="/producer" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />Volver a mis proyectos
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Nuevo proyecto</h1>
        <p className="mt-2 text-muted-foreground">
          Define el proyecto y cotiza cada hito. El monto total se calcula con la suma de las cotizaciones.
        </p>
      </header>
      <ProjectForm actionData={created} />
    </div>
  );
}
