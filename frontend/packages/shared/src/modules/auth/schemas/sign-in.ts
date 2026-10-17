import { z } from "zod";

export const signInSchema = z.object({
  email: z
    .string({ error: "Ingresa tu correo." })
    .trim()
    .min(1, { error: "Ingresa tu correo." })
    .max(120, { error: "Máximo 120 caracteres." })
    .pipe(z.email({ error: "Ingresa un correo válido, por ejemplo nombre@empresa.co." })),
  profileId: z.string({ error: "Selecciona tu perfil para entrar." }).trim().min(1, { error: "Selecciona tu perfil para entrar." }),
});

export type SignInInput = z.infer<typeof signInSchema>;
