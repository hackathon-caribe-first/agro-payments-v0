// The fixed identities of the app while there is no authentication. Every workstream (mocks and composition roots) reads them
// from here so that one person has one id, one name and one wallet everywhere.

export const INVESTOR_IDENTITY = {
  id: "investor-capital-verde",
  name: "Capital Verde Inversiones S.A.S.",
  wallet: "https://wallet.example/capital-verde",
} as const;

export const VERIFIER_IDENTITY = {
  id: "verifier-camila-rojas",
  name: "Camila Rojas",
  label: "Camila Rojas (verificadora)",
} as const;

// The platform's own wallet: the beneficiary of the commission line planned per milestone (D-06). Same wallet the trace shows as client.
export const PLATFORM_IDENTITY = {
  id: "platform",
  name: "Plataforma Surco",
  wallet: "https://wallet.example/surco",
} as const;

export const PRODUCER_IDENTITY = {
  id: "producer-main",
  name: "Agrícola La Esperanza S.A.S.",
} as const;
