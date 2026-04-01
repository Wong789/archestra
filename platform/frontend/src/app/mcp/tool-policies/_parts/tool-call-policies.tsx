import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { DebouncedInput } from "@/components/debounced-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useToolInvocationPolicies,
  useToolInvocationPolicyCreateMutation,
  useToolInvocationPolicyDeleteMutation,
  useToolInvocationPolicyUpdateMutation,
} from "@/lib/policy.query";
import {
  CALL_POLICY_ACTION_OPTIONS,
  DEFAULT_POLICY_TEMPLATE,
} from "@/lib/policy.utils";
import { PolicyTemplateEditor } from "./policy-template-editor";

type ToolForPolicies = {
  id: string;
};

export function ToolCallPolicies({ tool }: { tool: ToolForPolicies }) {
  const { data: invocationPolicies } = useToolInvocationPolicies();
  const createMutation = useToolInvocationPolicyCreateMutation();
  const deleteMutation = useToolInvocationPolicyDeleteMutation();
  const updateMutation = useToolInvocationPolicyUpdateMutation();

  const policies = invocationPolicies?.byProfileToolId[tool.id] || [];

  const reorderRules = async (
    reordered: Array<{ id: string; sortOrder: number }>,
  ) => {
    await Promise.all(
      reordered.map((rule, index) =>
        updateMutation.mutateAsync({
          id: rule.id,
          sortOrder: index,
        }),
      ),
    );
  };

  return (
    <div className="border border-border rounded-lg p-6 bg-card space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Tool Access Rules</h3>
        <p className="text-sm text-muted-foreground">
          Rules run from top to bottom. The first match wins.
        </p>
        <p className="text-xs text-muted-foreground">
          Reasonable default: keep a final <code>{DEFAULT_POLICY_TEMPLATE}</code>{" "}
          rule set to <strong>Allow in safe context</strong>.
        </p>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
          <p>
            No custom access rules yet. In restrictive mode, the tool is blocked
            whenever the context is marked sensitive.
          </p>
          <Button
            variant="outline"
            onClick={() =>
              createMutation.mutate({
                toolId: tool.id,
                sortOrder: 0,
              })
            }
          >
            <Plus className="w-4 h-4 mr-2" />
            Add default rule
          </Button>
        </div>
      ) : null}

      {policies.map((policy, index) => (
        <div
          key={policy.id}
          className="rounded-lg border border-border bg-muted/20 p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Rule {index + 1}</Badge>
              {policy.matchTemplate.trim() === DEFAULT_POLICY_TEMPLATE ? (
                <Badge variant="outline">Default</Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => {
                  const next = [...policies];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  void reorderRules(next.map((rule) => ({ id: rule.id, sortOrder: rule.sortOrder })));
                }}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={index === policies.length - 1}
                onClick={() => {
                  const next = [...policies];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  void reorderRules(next.map((rule) => ({ id: rule.id, sortOrder: rule.sortOrder })));
                }}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(policy.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">When</div>
            <PolicyTemplateEditor
              value={policy.matchTemplate}
              placeholder='Examples: {{hasLabel labels "sensitive"}} or {{matchInput input "path" "startsWith" "/etc"}}'
              onChange={(matchTemplate) =>
                updateMutation.mutate({
                  id: policy.id,
                  matchTemplate,
                })
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Then
              </div>
              <Select
                value={policy.action}
                onValueChange={(action) =>
                  updateMutation.mutate({
                    id: policy.id,
                    action: action as (typeof policy.action),
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALL_POLICY_ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {
                  CALL_POLICY_ACTION_OPTIONS.find(
                    (option) => option.value === policy.action,
                  )?.description
                }
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Reason shown when blocked
              </div>
              <DebouncedInput
                placeholder="Optional explanation for operators or end users"
                initialValue={policy.reason || ""}
                onChange={(reason) =>
                  updateMutation.mutate({
                    id: policy.id,
                    reason,
                  })
                }
              />
            </div>
          </div>
        </div>
      ))}

      {policies.length > 0 ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            createMutation.mutate({
              toolId: tool.id,
              sortOrder: policies.length,
            })
          }
        >
          <Plus className="w-4 h-4 mr-2" />
          Add rule
        </Button>
      ) : null}
    </div>
  );
}
