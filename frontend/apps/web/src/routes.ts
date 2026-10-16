import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),
    route("productor", "routes/productor.tsx"),
    route("verificador", "routes/verificador.tsx"),
    route("custodio", "routes/custodio.tsx"),
  ]),
] satisfies RouteConfig;
