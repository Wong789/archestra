"use client";

import { Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAgentEvals,
  useCreateAgentEvalRun,
  useDeleteAgentEval,
} from "@/lib/agent-eval.query";
import { CreateEvalDialog } from "./_components/create-eval-dialog";

export default function EvalsPageClient() {
  const { data, isLoading } = useAgentEvals();
  const deleteEval = useDeleteAgentEval();
  const createRun = useCreateAgentEvalRun();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <LoadingSpinner />;

  const evals = data?.data ?? [];

  return (
    <>
      {evals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <p className="text-muted-foreground">
            No evaluations yet. Create one to get started.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Evaluation
          </Button>
        </div>
      ) : (
        <>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Evaluation
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evals.map((evalItem) => (
                <TableRow key={evalItem.id}>
                  <TableCell>
                    <Link
                      href={`/agents/evals/${evalItem.id}`}
                      className="font-medium hover:underline"
                    >
                      {evalItem.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(evalItem.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => createRun.mutate(evalItem.id)}
                        title="Run evaluation"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEval.mutate(evalItem.id)}
                        title="Delete evaluation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <CreateEvalDialog open={showCreate} onOpenChange={setShowCreate} />
    </>
  );
}
