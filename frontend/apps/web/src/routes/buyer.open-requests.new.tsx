import { ArrowLeft } from "lucide-react";
import { Link, redirect } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { OpenRequestForm } from "~/components/open-request/form";
import { toActionData, type PresaleActionData } from "~/components/presale/error-copy";
import { buyer } from "~/buyer/module";
import type { Route } from "./+types/buyer.open-requests.new";

export const meta = () => [{ title: "Nueva solicitud abierta · Surco" }];

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ request }: Route.ClientActionArgs): Promise<PresaleActionData | Response> {
  const form = await request.formData();
  const result = await buyer.createOpenRequest({
    title: text(form, "title"),
    productionType: text(form, "productionType"),
    quantity: text(form, "quantity"),
    unit: text(form, "unit"),
    targetUnitPrice: text(form, "targetUnitPrice"),
    deliveryDate: text(form, "deliveryDate"),
    deliveryLocation: text(form, "deliveryLocation"),
    notes: text(form, "notes"),
  });
  return result.ok ? redirect(`/buyer/open-requests/${result.value.id}`) : toActionData(result.error);
}

export default function BuyerOpenRequestNew({ actionData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <Link to="/buyer/open-requests" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver a solicitudes abiertas
      </Link>
      <header>
        <h1 className="text-3xl text-primary">Nueva solicitud abierta</h1>
        <p className="mt-2 text-muted-foreground">
          Describe lo que necesitas. Los productores con producción en la misma unidad podrán ofertarte. No podrás editarla después, solo cerrarla.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-primary">Qué necesitas</CardTitle>
        </CardHeader>
        <CardContent>
          <OpenRequestForm actionData={actionData} />
        </CardContent>
      </Card>
    </div>
  );
}
