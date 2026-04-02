import { ForbiddenPage } from "@/app/_parts/forbidden-page";
import { serverCanAccessPage } from "@/lib/auth/auth.server";
import EvalsPageClient from "./page.client";

export const dynamic = "force-dynamic";

export default async function EvalsPageServer() {
  if (!(await serverCanAccessPage("/agents/evals"))) {
    return <ForbiddenPage />;
  }
  return <EvalsPageClient />;
}
