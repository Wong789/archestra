import { ForbiddenPage } from "@/app/_parts/forbidden-page";
import { serverCanAccessPage } from "@/lib/auth/auth.server";
import EvalDetailClient from "./page.client";

export const dynamic = "force-dynamic";

export default async function EvalDetailServer({
  params,
}: {
  params: Promise<{ evalId: string }>;
}) {
  if (!(await serverCanAccessPage("/agents/evals"))) {
    return <ForbiddenPage />;
  }
  const { evalId } = await params;
  return <EvalDetailClient evalId={evalId} />;
}
