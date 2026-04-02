"use client";

import { PageLayout } from "@/components/page-layout";

export default function EvalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageLayout
      title="Evaluations"
      description="Manage and run agent evaluation suites"
    >
      {children}
    </PageLayout>
  );
}
