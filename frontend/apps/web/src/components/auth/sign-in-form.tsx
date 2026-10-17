import { LogIn } from "lucide-react";
import { useState } from "react";
import { Form, useNavigation } from "react-router";
import { FORM_LEVEL_KEY, type FieldErrors } from "@agro/shared/modules/milestones/domain/errors";
import type { ProfileOption } from "@agro/shared/modules/auth/application/auth-repository";
import { ROLE_LABELS } from "@agro/shared/modules/auth/domain/role";
import { Alert, AlertDescription } from "@agro/shared/ui/alert";
import { Button } from "@agro/shared/ui/button";
import { Input } from "@agro/shared/ui/input";
import { cn } from "@agro/shared/lib/utils";
import { Field } from "~/components/presale/field";
import { useFieldErrors } from "~/components/presale/use-field-errors";
import { FieldError, invalidProps } from "~/components/producer/project-form/field-error";

export type SignInActionData = { fieldErrors: FieldErrors };

// Profile picker (radio cards) + email. The first invalid control gets the focus after a failed attempt.
export function SignInForm({ profiles, actionData }: { profiles: ProfileOption[]; actionData?: SignInActionData }) {
  const { formRef, errors, clear } = useFieldErrors(actionData);
  const pending = useNavigation().state !== "idle";
  const [profileId, setProfileId] = useState("");
  const [email, setEmail] = useState("");
  const profileAria = invalidProps("profile", errors.profileId);

  return (
    <Form method="post" ref={formRef} noValidate className="flex flex-col gap-5">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Selecciona tu perfil para entrar</legend>
        <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))]">
          {profiles.map((p, index) => (
            <label
              key={p.profileId}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg border bg-card p-3 transition-colors hover:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                profileId === p.profileId && "border-primary bg-accent",
              )}
            >
              <input
                type="radio"
                name="profileId"
                value={p.profileId}
                checked={profileId === p.profileId}
                className="sr-only"
                onChange={() => {
                  setProfileId(p.profileId);
                  setEmail(p.email);
                  clear("profileId");
                  clear("email");
                }}
                {...(index === 0 ? profileAria : {})}
              />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{ROLE_LABELS[p.role]}</span>
              <span className="truncate text-sm font-semibold" title={p.name}>
                {p.name}
              </span>
            </label>
          ))}
        </div>
        <FieldError id="profile" messages={errors.profileId} />
      </fieldset>

      <Field id="sign-in-email" label="Correo" errors={errors.email}>
        {(aria) => (
          <Input
            id="sign-in-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clear("email");
            }}
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
        <LogIn aria-hidden="true" />
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </Form>
  );
}
