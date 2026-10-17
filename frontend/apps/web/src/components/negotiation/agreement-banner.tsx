import { ArrowRight, Handshake } from "lucide-react";
import { Link } from "react-router";
import type { AuthorizationState } from "@agro/shared/modules/presales/domain/presale";
import { Button } from "@agro/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@agro/shared/ui/card";
import { AuthorizationStatus } from "~/components/payment-authorization/authorization-status";

// "Acordada": a PROJECT agreement exists. Shows the payment authorization state and links to the negotiation.
export function AgreementBanner({ authorization, to, title = "Proyecto acordado" }: { authorization: AuthorizationState | null; to: string; title?: string }) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="inline-flex items-center gap-1.5 text-base text-primary">
          <Handshake aria-hidden="true" className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        <AuthorizationStatus authorization={authorization} />
        <Button asChild variant="outline" size="compact" className="self-start">
          <Link to={to}>
            Ver negociación
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
