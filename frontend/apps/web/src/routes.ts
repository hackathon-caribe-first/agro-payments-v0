import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),
    route("productor", "routes/productor.tsx"),
    route("productor/proyectos/nuevo", "routes/productor.proyectos.nuevo.tsx"),
    route("productor/proyectos/:projectId", "routes/productor.proyecto.tsx"),
    route("productor/proyectos/:projectId/preventa", "routes/productor.proyecto.preventa.tsx"),
    route("productor/solicitudes", "routes/productor.solicitudes.tsx"),
    route("productor/solicitudes/:requestId", "routes/productor.solicitud.tsx"),
    route("productor/hitos/:milestoneId", "routes/productor.hito.tsx"),
    route("comprador", "routes/comprador.tsx"),
    route("comprador/solicitudes", "routes/comprador.solicitudes.tsx"),
    route("comprador/solicitudes/:requestId", "routes/comprador.solicitud.tsx"),
    route("comprador/preventas/:listingId", "routes/comprador.preventa.tsx"),
    route("verificador", "routes/verificador.tsx"),
    route("custodio", "routes/custodio.tsx"),
  ]),
] satisfies RouteConfig;
