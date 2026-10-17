// Sidebar entries of the operations & transparency area. `icon` is a lucide-react icon name.
export const opsNav = [
  { label: "Panel", to: "/investor/panel", icon: "LayoutDashboard", group: "Inversor" },
  { label: "Notificaciones", to: "/notifications?role=INVESTOR", icon: "Bell", group: "Inversor" },
  { label: "Notificaciones", to: "/notifications?role=PRODUCER", icon: "Bell", group: "Productor" },
  { label: "Conciliación", to: "/ops/reconciliation", icon: "Scale", group: "Operador" },
] as const;
