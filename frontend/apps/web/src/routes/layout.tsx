import { ChevronsLeft, ChevronsRight, ClipboardCheck, HandCoins, Landmark, Menu, ShoppingBasket, Sprout, type LucideIcon } from "lucide-react";
import { NavLink, Outlet, isRouteErrorResponse, useLocation, useRouteError } from "react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@agro/shared/ui/sidebar";
import { Button } from "@agro/shared/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@agro/shared/ui/tooltip";
import { NotificationsBell } from "~/components/notifications-bell";

const MODULES: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/producer", label: "Productor", icon: Sprout },
  { to: "/buyer", label: "Comprador", icon: ShoppingBasket },
  { to: "/investor", label: "Inversionista", icon: HandCoins },
  { to: "/verifier", label: "Verificador", icon: ClipboardCheck },
  { to: "/custodian", label: "Operador", icon: Landmark },
];

function AppSidebar() {
  const { pathname } = useLocation();
  return (
    <Sidebar collapsible="icon">
      {/* Brand left, toggle right; collapsed to the icon rail only the toggle remains, centered. */}
      <SidebarHeader className="flex-row items-center justify-between group-data-[collapsible=icon]:justify-center">
        <span className="px-2 font-brand text-xl font-black tracking-[-0.035em] group-data-[collapsible=icon]:hidden">SURCO.</span>
        <SidebarToggle />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {MODULES.map(({ to, label, icon: Icon }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton asChild isActive={pathname === to || pathname.startsWith(`${to}/`)} tooltip={label}>
                    <NavLink to={to}>
                      <Icon />
                      <span>{label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
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
  const { pathname } = useLocation();
  const current = MODULES.find((m) => pathname === m.to || pathname.startsWith(`${m.to}/`));
  return <span className="font-brand text-sm font-semibold text-foreground">{current?.label ?? "Surco"}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0 lets the inset shrink with its flex parent instead of overflowing when the sidebar opens. */}
      <SidebarInset className="min-w-0">
        {/* Mobile: the sidebar is an off-canvas sheet and needs an opener outside it. Every size: the RF-37 notices bell. */}
        <header className="flex h-12 items-center gap-3 border-b bg-card px-4">
          <div className="flex items-center gap-3 md:hidden">
            <SidebarToggle />
            <PageTitle />
          </div>
          <div className="ml-auto">
            <NotificationsBell />
          </div>
        </header>
        <div className="w-full min-w-0 px-4 py-4 md:px-6 md:py-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Layout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : null;
  return (
    <Shell>
      <h1 className="text-2xl text-primary">No pudimos cargar los hitos</h1>
      <p className="mt-2 text-muted-foreground">Revisa tu conexión y vuelve a intentarlo.</p>
      {detail && <p className="mt-2 text-sm text-destructive">{detail}</p>}
      <a href="" className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        Reintentar
      </a>
    </Shell>
  );
}
