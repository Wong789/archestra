import {
  DocsPage,
  SENSITIVE_TOOL_CONTEXT_LABEL,
  type archestraApiTypes,
  getDocsUrl,
} from "@shared";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { DebouncedInput } from "@/components/debounced-input";
import { ExternalDocsLink } from "@/components/external-docs-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrganization } from "@/lib/organization.query";
import {
  useToolResultPolicies,
  useToolResultPoliciesCreateMutation,
  useToolResultPoliciesDeleteMutation,
  useToolResultPoliciesUpdateMutation,
} from "@/lib/policy.query";
import {
  DEFAULT_POLICY_TEMPLATE,
  RESULT_POLICY_ACTION_OPTIONS,
  normalizeResultPolicyAction,
  normalizeResultPolicyLabels,
} from "@/lib/policy.utils";
import { PolicyTemplateEditor } from "./policy-template-editor";

type ToolForPolicies = {
  id: string;
};

export function ToolResultPolicies({ tool }: { tool: ToolForPolicies }) {
  const { data: resultPolicies } = useToolResultPolicies();
  const createMutation = useToolResultPoliciesCreateMutation();
  const deleteMutation = useToolResultPoliciesDeleteMutation();
  const updateMutation = useToolResultPoliciesUpdateMutation();
  const { data: organization } = useOrganization();

  const policies = resultPolicies?.byProfileToolId[tool.id] || [];
  const availableLabels = organization?.toolContextLabels ?? [
    "safe",
    SENSITIVE_TOOL_CONTEXT_LABEL,
  ];

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
        <h3 className="text-sm font-semibold">Context Label Rules</h3>
        <p className="text-sm text-muted-foreground">
          Match tool output, then attach labels, sanitize, or block the result.
        </p>
        <p className="text-xs text-muted-foreground">
          If no rule matches, this tool is treated as{" "}
          <code>{SENSITIVE_TOOL_CONTEXT_LABEL}</code> by default.{" "}
          <ExternalDocsLink
            href={getDocsUrl(DocsPage.PlatformDynamicTools)}
            className="underline hover:text-foreground"
            showIcon={false}
          >
            Read the docs
          </ExternalDocsLink>
          .
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {availableLabels.map((label) => (
          <Badge key={label} variant="outline">
            {label}
          </Badge>
        ))}
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground space-y-3">
          <p>
            No custom output rules yet. Results from this tool will add the{" "}
            <code>{SENSITIVE_TOOL_CONTEXT_LABEL}</code> label unless you match
            them more specifically.
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
            Add rule
          </Button>
        </div>
      ) : null}

      {policies.map((policy, index) => {
        const action = normalizeResultPolicyAction(policy.action);
        const labels = normalizeResultPolicyLabels(policy);

        return (
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
                placeholder='Examples: {{matchOutput output "emails[*].from" "endsWith" "@company.com"}} or {{hasLabel labels "customer-data"}}'
                onChange={(matchTemplate) =>
                  updateMutation.mutate({
                    id: policy.id,
                    matchTemplate,
                  })
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Then
                </div>
                <Select
                  value={action}
                  onValueChange={(nextAction) =>
                    updateMutation.mutate({
                      id: policy.id,
                      action:
                        nextAction as archestraApiTypes.UpdateTrustedDataPolicyData["body"]["action"],
                      labels:
                        nextAction === "assign_labels"
                          ? labels.length > 0
                            ? labels
                            : [SENSITIVE_TOOL_CONTEXT_LABEL]
                          : [],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESULT_POLICY_ACTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {
                    RESULT_POLICY_ACTION_OPTIONS.find(
                      (option) => option.value === action,
                    )?.description
                  }
                </p>
              </div>

              {action === "assign_labels" ? (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Labels to add
                  </div>
                  <DebouncedInput
                    placeholder="Comma-separated labels, e.g. safe, internal, customer-data"
                    initialValue={labels.join(", ")}
                    onChange={(value) =>
                      updateMutation.mutate({
                        id: policy.id,
                        action: "assign_labels",
                        labels: value
                          .split(",")
                          .map((label) => label.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                  This rule does not add labels.
                </div>
              )}
            </div>
          </div>
        );
      })}

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
