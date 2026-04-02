import { ForbiddenPage } from "@/app/_parts/forbidden-page";
import { serverCanAccessPage } from "@/lib/auth/auth.server";
import RunResultsClient from "./page.client";

export const dynamic = "force-dynamic";

export default async function RunResultsServer({
  params,
}: {
  params: Promise<{ evalId: string; runId: string }>;
}) {
  if (!(await serverCanAccessPage("/agents/evals"))) {
    return <ForbiddenPage />;
  }
  const { evalId, runId } = await params;
  return <RunResultsClient evalId={evalId} runId={runId} />;
}
