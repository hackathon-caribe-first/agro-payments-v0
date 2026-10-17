import { Link, isRouteErrorResponse, useRouteError } from "react-router";

// Shared ErrorBoundary body: 404 vs. generic failure, with a way back.
export function HarvestRouteError({ notFoundTitle, failureTitle, backTo, backLabel }: { notFoundTitle: string; failureTitle: string; backTo: string; backLabel: string }) {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <>
      <h1 className="text-2xl text-primary">{notFound ? notFoundTitle : failureTitle}</h1>
      <Link to={backTo} className="mt-6 inline-block font-brand font-bold text-primary underline underline-offset-4">
        {backLabel}
      </Link>
    </>
  );
}
