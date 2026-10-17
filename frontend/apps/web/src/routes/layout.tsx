import {
  BadgeCheck,
  Bell,
  ChevronsLeft,
  ChevronsRight,
  ClipboardCheck,
  ClipboardList,
  FileSearch,
  Handshake,
  HandCoins,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Menu,
  PackageCheck,
  Scale,
  ShoppingBasket,
  Sprout,
  Store,
  LogOut,
  Terminal,
  Truck,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Form, Link, NavLink, Outlet, isRouteErrorResponse, useFetchers, useLocation, useNavigation, useRouteError, useRouteLoaderData } from "react-router";
import { canAccess } from "@agro/shared/modules/auth/domain/access";
import { ROLE_LABELS, type Session } from "@agro/shared/modules/auth/domain/role";
import { NOTIFICATION_ROLES, type NotificationRole } from "@agro/shared/modules/reviews/domain/review";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@agro/shared/ui/sidebar";
import { Button } from "@agro/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@agro/shared/ui/tooltip";
import { grantNav } from "./grant.nav";
import { harvestNav } from "./harvest.nav";
import { investmentNav } from "./investment.nav";
import { opsNav } from "./ops.nav";
import { loadUnreadCount } from "~/reviews/notifications";
import { reviewNav } from "./review.nav";
import { splitNav } from "./split.nav";
import { supplierNav } from "./supplier.nav";
import { requireSession } from "~/auth/guard";
import { UnauthorizedView } from "~/components/auth/unauthorized-view";
import type { Route } from "./+types/layout";

const ICONS: Record<string, LucideIcon> = {
  BadgeCheck,
  Bell,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  KeyRound,
  Landmark,
  LayoutDashboard,
  PackageCheck,
  Scale,
  Sprout,
  Store,
  Terminal,
  Truck,
  Wallet,
  Wheat,
};

type NavEntry = { label: string; to: string; icon: string; group: string };

// Items that already existed (module landing pages) plus the workstream fragments, ordered per group.
const EXISTING: NavEntry[] = [
  { label: "Proyectos", to: "/producer", icon: "Sprout", group: "Productor" },
  { label: "Negociaciones", to: "/producer/negotiations", icon: "Handshake", group: "Productor" },
  { label: "Solicitudes abiertas", to: "/producer/open-requests", icon: "Megaphone", group: "Productor" },
  { label: "Proyectos", to: "/buyer", icon: "ShoppingBasket", group: "Comprador" },
  { label: "Negociaciones", to: "/buyer/negotiations", icon: "Handshake", group: "Comprador" },
  { label: "Solicitudes abiertas", to: "/buyer/open-requests", icon: "Megaphone", group: "Comprador" },
  { label: "Hitos del servidor", to: "/verifier", icon: "FileSearch", group: "Verificador" },
  { label: "Pagos por hito", to: "/custodian", icon: "Landmark", group: "Operador" },
];
Object.assign(ICONS, { Handshake, Megaphone, ShoppingBasket, FileSearch });

const GROUP_ORDER = ["Productor", "Comprador", "Verificador", "Inversor", "Proveedor", "Operador"];
// "Cosecha" (/producer) duplicates "Proyectos"; the harvest declaration lives on each project page.
const FRAGMENTS: readonly NavEntry[] = [...splitNav, ...harvestNav, ...grantNav, ...reviewNav, ...investmentNav, ...opsNav, ...supplierNav].filter(
  (n) => !(n.label === "Cosecha" && n.to === "/producer"),
);
const ITEM_ORDER = [
  "/producer", "/producer/negotiations", "/producer/open-requests", "/producer/proposals", "/producer/suppliers", "/producer/orders", "/notifications?role=PRODUCER",
  "/buyer", "/buyer/negotiations", "/buyer/open-requests", "/buyer/marketplace", "/buyer/orders",
  "/verifier/reviews", "/verifier/harvests", "/verifier/notifications", "/verifier",
  "/investor/panel", "/investor/projects", "/investor/proposals", "/investor/grants", "/investor/settlements", "/notifications?role=INVESTOR",
  "/supplier",
  "/custodian", "/ops/reconciliation", "/ops/trace",
];
const NAV_ITEMS: NavEntry[] = [...EXISTING, ...FRAGMENTS].sort((a, b) => ITEM_ORDER.indexOf(a.to) - ITEM_ORDER.indexOf(b.to));

// RNF-07: the sidebar only offers what the role can open (same table as the route guard). Entries that differ by `?role=`
// (notifications) are further narrowed to the role of the session.
export function navGroupsFor(role: Session["role"]) {
  const visible = NAV_ITEMS.filter((n) => {
    if (!canAccess(role, pathOf(n.to))) return false;
    const target = n.to.includes("?") ? roleOf(n.to.split("?")[1] ?? "") : null;
    return target === null || target === role;
  });
  return GROUP_ORDER.map((group) => ({ group, items: visible.filter((n) => n.group === group) })).filter((g) => g.items.length > 0);
}

const pathOf = (to: string) => to.split("?")[0];

function matches(pathname: string, to: string) {
  const path = pathOf(to);
  return pathname === path || pathname.startsWith(`${path}/`);
}

// Items that share a path and differ by `?role=` (notifications): the one for the current role wins; no role means PRODUCER.
const roleOf = (query: string) => new URLSearchParams(query).get("role");
const queryMatches = (to: string, search: string) => to.includes("?") && roleOf(to.split("?")[1]) === (roleOf(search) ?? "PRODUCER");

// The most specific item wins so /producer/orders does not also light up /producer.
function activeItem(pathname: string, search = ""): NavEntry | undefined {
  return NAV_ITEMS.filter((n) => matches(pathname, n.to)).sort(
    (a, b) => pathOf(b.to).length - pathOf(a.to).length || Number(queryMatches(b.to, search)) - Number(queryMatches(a.to, search)),
  )[0];
}

// RF-18: unread notifications per role for the sidebar badge. Re-reads after navigations and after any form/fetcher settles
// (marking notifications as read), so the number never lags behind what the page shows.
function useUnreadCounts(role: Session["role"] | undefined): Partial<Record<NotificationRole, number>> {
  const { pathname, search } = useLocation();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const settled = navigation.state === "idle" && fetchers.every((f) => f.state === "idle");
  const [counts, setCounts] = useState<Partial<Record<NotificationRole, number>>>({});
  useEffect(() => {
    const own = NOTIFICATION_ROLES.filter((r) => r === role);
    if (!settled || own.length === 0) return;
    let live = true;
    void Promise.all(own.map(async (role) => [role, await loadUnreadCount(role)] as const)).then((entries) => {
      if (live) setCounts(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [pathname, search, settled, role]);
  return counts;
}

function AppSidebar({ session }: { session: Session | null }) {
  const { pathname, search } = useLocation();
  const active = activeItem(pathname, search);
  const unread = useUnreadCounts(session?.role);
  const groups = session ? navGroupsFor(session.role) : [];
  return (
    <Sidebar collapsible="icon">
      {/* Brand left, toggle right; collapsed to the icon rail only the toggle remains, centered. */}
      <SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:justify-center">
        <span className="px-2 font-brand text-xl font-black tracking-[-0.035em] group-data-[collapsible=icon]:hidden">SURCO.</span>
        <SidebarToggle />
      </SidebarHeader>
      <SidebarContent>
        {groups.map(({ group, items }) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map(({ to, label, icon }) => {
                  const Icon = ICONS[icon] ?? Sprout;
                  const role = to.startsWith("/notifications") ? roleOf(to.split("?")[1] ?? "") : null;
                  const count = role ? (unread[role as NotificationRole] ?? 0) : 0;
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={active?.to === to} tooltip={`${group}: ${label}`}>
                        <NavLink to={to}>
                          <Icon />
                          <span>{label}</span>
                        </NavLink>
                      </SidebarMenuButton>
                      {count > 0 && (
                        <SidebarMenuBadge>
                          <span aria-hidden="true">{count}</span>
                          <span className="sr-only">{count === 1 ? "1 notificación sin leer" : `${count} notificaciones sin leer`}</span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {session && <UserChip session={session} />}
    </Sidebar>
  );
}

// Who is signed in and the way out. Collapsed to the icon rail only the initial remains.
function UserChip({ session }: { session: Session }) {
  return (
    <SidebarFooter className="border-t">
      <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
        <span
          aria-hidden="true"
          title={`${session.name} · ${ROLE_LABELS[session.role]}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-brand text-sm font-bold text-primary-foreground"
        >
          {session.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
          <p className="truncate text-sm font-semibold" title={session.name}>
            {session.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[session.role]}</p>
        </div>
      </div>
      <Form method="post" action="/logout">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="submit" variant="outline" size="compact" className="w-full group-data-[collapsible=icon]:size-[33px] group-data-[collapsible=icon]:px-0" aria-label="Cerrar sesión">
              <LogOut aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">Cerrar sesión</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Cerrar sesión</TooltipContent>
        </Tooltip>
      </Form>
    </SidebarFooter>
  );
}

// Show/hide control. Desktop collapses to icons, mobile opens the off-canvas menu; Ctrl/Cmd+B still works.
function SidebarToggle() {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const visible = isMobile ? openMobile : state === "expanded";
  const label = visible ? "Ocultar menú lateral" : "Mostrar menú lateral";
  // Desktop: chevrons point where the sidebar goes. Mobile: menu opens the sheet, chevrons inside it close it.
  const Icon = isMobile ? (openMobile ? ChevronsLeft : Menu) : visible ? ChevronsLeft : ChevronsRight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-compact" aria-label={label} onClick={toggleSidebar}>
          <Icon aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PageTitle() {
  const { pathname, search } = useLocation();
  const current = activeItem(pathname, search);
  return <span className="font-brand text-sm font-semibold text-foreground">{current ? `${current.group}: ${current.label}` : "Surco"}</span>;
}

function Shell({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar session={session} />
      {/* min-w-0 lets the inset shrink with its flex parent instead of overflowing when the sidebar opens. */}
      <SidebarInset className="min-w-0">
        {/* Mobile only: the sidebar is an off-canvas sheet and needs an opener outside it. */}
        <header className="flex h-12 items-center gap-3 border-b bg-card px-4 md:hidden">
          <SidebarToggle />
          <PageTitle />
        </header>
        <div className="w-full min-w-0 px-4 py-4 md:px-6 md:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// RNF-07 guard: no session -> /login?next=...; a role that cannot open the path -> 403 (see ErrorBoundary).
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  return { session: await requireSession(request) };
}

// The role can change between two navigations of this same layout, so the guard must run on every one of them.
export function shouldRevalidate() {
  return true;
}

export default function Layout({ loaderData }: Route.ComponentProps) {
  return (
    <Shell session={loaderData.session}>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const loaded = useRouteLoaderData<typeof clientLoader>("routes/layout");
  if (isRouteErrorResponse(error) && error.status === 403) {
    const session = (error.data as { session?: Session } | null)?.session ?? loaded?.session ?? null;
    return (
      <Shell session={session}>
        <UnauthorizedView session={session} />
      </Shell>
    );
  }
  const session = loaded?.session ?? null;
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Shell session={session}>
        <h1 className="text-2xl text-primary">No encontramos esta página</h1>
        <p className="mt-2 text-muted-foreground">Es posible que el enlace haya cambiado o que ya no exista.</p>
        <Link to="/" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
          Ir al panel principal
        </Link>
      </Shell>
    );
  }
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <Shell session={session}>
      <h1 className="text-2xl text-primary">Algo salió mal</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo. Si el problema continúa, regresa al panel principal.</p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </Shell>
  );
}
