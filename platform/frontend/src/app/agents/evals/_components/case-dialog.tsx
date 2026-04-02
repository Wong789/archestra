"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateAgentEvalCase,
  useUpdateAgentEvalCase,
} from "@/lib/agent-eval.query";

const YAML_PLACEHOLDER = `toolCalls:
  - tool: kubectl_get
    args:
      resource: pods
      namespace: /prod-.*/
    assert: expected

  - tool: dangerous_delete
    assert: forbidden`;

interface FormValues {
  name: string;
  input: string;
  assertionsYaml: string;
}

interface EvalCase {
  id: string;
  name: string;
  input: unknown;
  expectedToolCalls: { yaml?: string; toolCalls?: unknown[] } | null;
}

export function CaseDialog({
  evalId,
  editCase,
  open,
  onOpenChange,
}: {
  evalId: string;
  editCase?: EvalCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createCase = useCreateAgentEvalCase();
  const updateCase = useUpdateAgentEvalCase();
  const isEdit = !!editCase;
  const form = useForm<FormValues>({
    defaultValues: { name: "", input: "", assertionsYaml: "" },
  });

  useEffect(() => {
    if (open && editCase) {
      form.reset({
        name: editCase.name,
        input:
          typeof editCase.input === "string"
            ? editCase.input
            : JSON.stringify(editCase.input, null, 2),
        assertionsYaml: editCase.expectedToolCalls?.yaml ?? "",
      });
    } else if (open) {
      form.reset({ name: "", input: "", assertionsYaml: "" });
    }
  }, [open, editCase, form]);

  const onSubmit = async () => {
    const values = form.getValues();
    if (isEdit && editCase) {
      await updateCase.mutateAsync({
        evalId,
        caseId: editCase.id,
        body: {
          name: values.name,
          input: values.input,
          assertionsYaml: values.assertionsYaml || undefined,
        },
      });
    } else {
      await createCase.mutateAsync({
        evalId,
        body: {
          name: values.name,
          input: values.input,
          assertionsYaml: values.assertionsYaml || undefined,
        },
      });
    }
    onOpenChange(false);
  };

  const isPending = createCase.isPending || updateCase.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Case" : "Add Eval Case"}</DialogTitle>
        </DialogHeader>
        <DialogForm onSubmit={form.handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="case-name">Name</Label>
              <Input
                id="case-name"
                placeholder="e.g., OOM in web-server pod"
                {...form.register("name", { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-input">Input</Label>
              <Textarea
                id="case-input"
                rows={3}
                placeholder="The message that will be sent to the agent"
                {...form.register("input", { required: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="case-assertions">
                Static Assertions (YAML, optional)
              </Label>
              <Textarea
                id="case-assertions"
                className="font-mono text-sm"
                rows={10}
                placeholder={YAML_PLACEHOLDER}
                {...form.register("assertionsYaml")}
              />
              <p className="text-xs text-muted-foreground">
                Tool names and arg values support exact match or{" "}
                <code className="text-xs">/regex/</code> patterns.
              </p>
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
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save" : "Add Case"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}
