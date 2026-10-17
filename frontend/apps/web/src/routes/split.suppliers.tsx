import { redirect } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { splitErrorMessage, toSplitActionData, type SplitActionData } from "~/components/split/copy";
import { SupplierForm } from "~/components/split/supplier-form";
import { SupplierList } from "~/components/split/supplier-list";
import { producerLines } from "~/payment-lines/module";
import { requireSession } from "~/auth/guard";
import type { Route } from "./+types/split.suppliers";

export const meta = () => [{ title: "Proveedores · Surco" }];

export async function clientLoader() {
  const result = await producerLines.listSuppliers();
  if (!result.ok) throw new Response(splitErrorMessage(result.error), { status: 502 });
  return { suppliers: result.value };
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

export async function clientAction({ request }: Route.ClientActionArgs): Promise<SplitActionData | Response> {
  await requireSession(request); // actions run before the layout guard (RNF-07)
  const form = await request.formData();
  if (form.get("intent") !== "create") return { fieldErrors: { _form: ["Acción desconocida."] } };
  const result = await producerLines.createSupplier({
    name: text(form, "name"),
    category: text(form, "category"),
    walletAddress: text(form, "walletAddress"),
  });
  return result.ok ? redirect("/producer/suppliers") : toSplitActionData(result.error);
}

export default function ProducerSuppliers({ loaderData, actionData }: Route.ComponentProps) {
  const { suppliers } = loaderData;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl text-primary">Proveedores</h1>
        <p className="text-pretty text-muted-foreground">
          Registra a quién le pagas facturas y órdenes. Cada pago va directo de la billetera del inversor a la billetera del proveedor, por eso validamos la billetera antes de guardarla.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="text-lg text-primary">Nuevo proveedor</CardTitle>
            </CardHeader>
            <CardContent className="px-4">
              <SupplierForm key={suppliers.length} actionData={actionData} />
            </CardContent>
          </Card>
        </aside>

        <section aria-labelledby="suppliers-heading" className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-1">
          <h2 id="suppliers-heading" className="text-lg text-primary">
            Proveedores registrados ({suppliers.length})
          </h2>
          <SupplierList suppliers={suppliers} />
        </section>
      </div>
    </div>
  );
}
