// Fragment for the sidebar. `icon` is a lucide-react icon name. Contracts have no list page: they are reached from
// each proposal (detail and list rows), so they get no nav item of their own.
export const investmentNav = [
  { label: "Proyectos", to: "/investor/projects", icon: "Sprout", group: "Inversor" },
  { label: "Mis propuestas", to: "/investor/proposals", icon: "HandCoins", group: "Inversor" },
  { label: "Propuestas de inversión", to: "/producer/proposals", icon: "HandCoins", group: "Productor" },
] as const;
