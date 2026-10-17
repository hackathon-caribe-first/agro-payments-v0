import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { ProjectForm, type CreateProjectActionData } from "~/components/producer/project-form/project-form";
import { errorMessage } from "~/producer/error-copy";
import { producer } from "~/producer/module";
import type { Route } from "./+types/productor.proyectos.nuevo";

export const meta = () => [{ title: "Nuevo proyecto · Surco" }];

export async function clientAction({ request }: Route.ClientActionArgs): Promise<CreateProjectActionData | Response> {
  const form = await request.formData();

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return { fieldErrors: { [FORM_LEVEL_KEY]: ["No pudimos leer el formulario. Recarga la página e intenta de nuevo."] } };
  }

  const result = await producer.createProject(raw);
  if (result.ok) return redirect(`/productor/proyectos/${result.value.id}`);

  if (result.error.kind === "validation") return { fieldErrors: result.error.fieldErrors };
  return { fieldErrors: { [FORM_LEVEL_KEY]: [errorMessage(result.error)] } };
}

export default function NuevoProyecto({ actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/productor" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />Volver a mis proyectos
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Nuevo proyecto</h1>
        <p className="mt-2 text-muted-foreground">
          Define el proyecto y cotiza cada hito. El monto total se calcula con la suma de las cotizaciones.
        </p>
      </header>
      <ProjectForm actionData={actionData} />
    </div>
  );
}
