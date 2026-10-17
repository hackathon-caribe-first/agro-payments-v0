import { BadgeCheck, Loader2 } from "lucide-react";
import { useFetcher } from "react-router";
import type { FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { Label } from "@agro/shared/ui/label";
import { FieldError, invalidProps } from "./field-error";

// Answer of the `validate-wallet` intent of the project route (RF-01): the wallet as the provider reports it, or why it cannot be used.
export type WalletCheckActionData = {
  // The text that was checked, so a stale answer is never shown for edited text.
  checked: string;
  fieldErrors: FieldErrors;
  wallet?: { assetCode: string; assetScale: number; publicName: string };
};

const ID = "project-producer-wallet";

type Props = {
  value: string;
  errors?: string[];
  onChange: (value: string) => void;
};

// RF-01: the billetera where the producer is paid. "Validar billetera" runs the same check the creation repeats before saving.
export function WalletField({ value, errors, onChange }: Props) {
  const fetcher = useFetcher<WalletCheckActionData>();
  const checking = fetcher.state !== "idle";
  const answer = fetcher.data && fetcher.data.checked === value.trim() ? fetcher.data : null;
  const messages = errors?.length ? errors : answer?.fieldErrors.producerWallet;
  const hintId = `${ID}-hint`;
  const describedBy = [hintId, messages?.length ? `${ID}-error` : null, answer?.wallet ? `${ID}-ok` : null].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ID}>Billetera del productor</Label>
      <div className="flex flex-wrap items-start gap-2">
        <Input
          id={ID}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://ilp.interledger-test.dev/mi-billetera"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 basis-64"
          {...invalidProps(ID, messages)}
          aria-describedby={describedBy}
        />
        <Button
          type="button"
          variant="outline"
          size="compact"
          disabled={checking || value.trim() === ""}
          onClick={() => fetcher.submit({ intent: "validate-wallet", producerWallet: value }, { method: "post" })}
        >
          {checking ? <Loader2 aria-hidden="true" className="animate-spin" /> : <BadgeCheck aria-hidden="true" />}
          {checking ? "Validando…" : "Validar billetera"}
        </Button>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        Aquí recibirás los pagos de tu mano de obra. Usa la dirección de tu billetera, por ejemplo https://ilp.interledger-test.dev/nombre.
      </p>
      <div aria-live="polite">
        {answer?.wallet && (
          <p id={`${ID}-ok`} className="text-sm font-semibold text-primary">
            ✓ Billetera validada: {answer.wallet.assetCode}, {answer.wallet.assetScale === 0 ? "sin decimales" : `${answer.wallet.assetScale} decimales`}
            {answer.wallet.publicName ? ` · ${answer.wallet.publicName}` : ""}
          </p>
        )}
        <FieldError id={ID} messages={messages} />
      </div>
    </div>
  );
}
