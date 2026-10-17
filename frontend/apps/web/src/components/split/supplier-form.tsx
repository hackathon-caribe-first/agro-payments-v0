import { UserPlus } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY } from "@agro/shared/modules/milestones/domain/errors";
import { SUPPLIER_CATEGORIES } from "@agro/shared/modules/payment-lines/domain/supplier";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@agro/shared/ui/select";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { CATEGORY_LABELS, type SplitActionData } from "./copy";

// Registers a supplier. The server checks the wallet (it exists and pays in COP) before saving.
export function SupplierForm({ actionData }: { actionData?: SplitActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="create" />

      <Field id="supplier-name" label="Nombre del proveedor" errors={errors.name}>
        {(aria) => <Input id="supplier-name" name="name" autoComplete="off" maxLength={80} onChange={() => clear("name")} {...aria} />}
      </Field>

      <Field id="supplier-category" label="Categoría" errors={errors.category}>
        {(aria) => (
          <Select name="category" defaultValue="insumos" onValueChange={() => clear("category")}>
            <SelectTrigger id="supplier-category" className="w-full" {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPLIER_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        id="supplier-wallet"
        label="Billetera del proveedor"
        errors={errors.walletAddress}
        hint="Dirección de la billetera, por ejemplo https://ilp.interledger-test.dev/nombre. Debe operar en COP."
      >
        {(aria) => (
          <Input
            id="supplier-wallet"
            name="walletAddress"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            onChange={() => clear("walletAddress")}
            {...aria}
          />
        )}
      </Field>

      {errors[FORM_LEVEL_KEY]?.length ? (
        <Alert variant="destructive">
          <AlertDescription>{errors[FORM_LEVEL_KEY].join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="compact" disabled={pending} className="self-start">
        <UserPlus aria-hidden="true" />
        {pending ? "Validando billetera…" : "Registrar proveedor"}
      </Button>
    </Form>
  );
}
