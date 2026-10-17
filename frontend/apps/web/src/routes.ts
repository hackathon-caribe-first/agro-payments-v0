import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/index.tsx"),
    route("producer", "routes/producer.tsx"),
    route("producer/projects/new", "routes/producer.projects.new.tsx"),
    route("producer/assistant", "routes/producer.assistant.tsx"),
    route("producer/projects/:projectId", "routes/producer.project.tsx"),
    route("producer/projects/:projectId/publication", "routes/producer.project.publication.tsx"),
    route("producer/negotiations", "routes/producer.negotiations.tsx"),
    route("producer/negotiations/:negotiationId", "routes/producer.negotiation.tsx"),
    route("producer/open-requests", "routes/producer.open-requests.tsx"),
    route("producer/open-requests/:openRequestId", "routes/producer.open-request.tsx"),
    // /requests[/:id] predates negotiations: redirect-only.
    route("producer/requests", "routes/producer.requests.tsx"),
    route("producer/requests/:requestId", "routes/producer.request.tsx"),
    // Legacy: redirect-only.
    route("producer/projects/:projectId/presale", "routes/producer.project.presale.tsx"),
    route("producer/milestones/:milestoneId", "routes/producer.milestone.tsx"),
    route("buyer", "routes/buyer.tsx"),
    route("buyer/negotiations", "routes/buyer.negotiations.tsx"),
    route("buyer/negotiations/:negotiationId", "routes/buyer.negotiation.tsx"),
    route("buyer/open-requests", "routes/buyer.open-requests.tsx"),
    route("buyer/open-requests/new", "routes/buyer.open-requests.new.tsx"),
    route("buyer/open-requests/:openRequestId", "routes/buyer.open-request.tsx"),
    // /requests[/:id] predates negotiations: redirect-only.
    route("buyer/requests", "routes/buyer.requests.tsx"),
    route("buyer/requests/:requestId", "routes/buyer.request.tsx"),
    // Legacy: redirect-only.
    route("buyer/presales/:listingId", "routes/buyer.presales.tsx"),
    route("buyer/projects/:projectId/negotiations/new", "routes/buyer.project.negotiations.new.tsx"),
    route("buyer/projects/:projectId", "routes/buyer.project.tsx"),
    route("investor", "routes/investor.tsx"),
    route("investor/projects/:projectId", "routes/investor.project.tsx"),
    route("investor/projects/:projectId/panel", "routes/investor.project.panel.tsx"),
    route("verifier", "routes/verifier.tsx"),
    route("custodian", "routes/custodian.tsx"),
    // LEGACY Spanish URLs: all redirect to the English ones (see routes/legacy-redirect.tsx).
    route("productor", "routes/legacy-redirect.tsx", { id: "legacy-productor" }),
    route("productor/*", "routes/legacy-redirect.tsx", { id: "legacy-productor-splat" }),
    route("comprador", "routes/legacy-redirect.tsx", { id: "legacy-comprador" }),
    route("comprador/*", "routes/legacy-redirect.tsx", { id: "legacy-comprador-splat" }),
    route("verificador", "routes/legacy-redirect.tsx", { id: "legacy-verificador" }),
    route("custodio", "routes/legacy-redirect.tsx", { id: "legacy-custodio" }),
  ]),
] satisfies RouteConfig;
