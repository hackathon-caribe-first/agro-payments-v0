// Sidebar entries of the harvest / marketplace / orders / liquidation area (icons are lucide-react names).
export const harvestNav = [
  { label: "Órdenes", to: "/producer/orders", icon: "PackageCheck", group: "Productor" },
  { label: "Cosecha", to: "/producer", icon: "Wheat", group: "Productor" },
  { label: "Mercado", to: "/buyer/marketplace", icon: "Store", group: "Comprador" },
  { label: "Mis órdenes", to: "/buyer/orders", icon: "ClipboardList", group: "Comprador" },
  { label: "Cosechas", to: "/verifier/harvests", icon: "BadgeCheck", group: "Verificador" },
  { label: "Liquidaciones", to: "/investor/settlements", icon: "Landmark", group: "Inversor" },
] as const;
