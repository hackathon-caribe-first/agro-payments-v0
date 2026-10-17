import { X } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { Button } from "@agro/shared/ui/button";

export function DeclineForm() {
  const pending = useNavigation().state !== "idle";
  return (
    <Form method="post">
      <input type="hidden" name="intent" value="decline" />
      <Button type="submit" variant="outline" size="compact" disabled={pending}>
        <X aria-hidden="true" />
        Rechazar solicitud
      </Button>
    </Form>
  );
}
