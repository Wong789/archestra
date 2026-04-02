"use client";

import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfilesPaginated } from "@/lib/agent.query";
import { useCreateAgentEval } from "@/lib/agent-eval.query";

interface FormValues {
  name: string;
  agentId: string;
}

export function CreateEvalDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createEval = useCreateAgentEval();
  const { data: agentsData } = useProfilesPaginated({
    limit: 100,
    offset: 0,
    agentTypes: ["agent"],
  });
  const form = useForm<FormValues>({
    defaultValues: { name: "", agentId: "" },
  });

  const agents = agentsData?.data ?? [];

  const onSubmit = async (values: FormValues) => {
    await createEval.mutateAsync({
      name: values.name,
      agentId: values.agentId || undefined,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Evaluation</DialogTitle>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., OOM Alert Evaluation"
                {...form.register("name", { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>Agent</Label>
              <Controller
                name="agentId"
                control={form.control}
                rules={{ required: true }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createEval.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
