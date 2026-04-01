import {
  DEFAULT_TOOL_CONTEXT_LABELS,
  LABEL_RESERVED_CHARS,
  SAFE_TOOL_CONTEXT_LABEL,
  SENSITIVE_TOOL_CONTEXT_LABEL,
} from "@shared";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";
import { SupportedOperatorSchema } from "./operator";

export const TrustedDataPolicyActionSchema = z.enum([
  "assign_labels",
  "block_always",
  "mark_as_trusted",
  "mark_as_untrusted",
  "sanitize_with_dual_llm",
]);

export const ResultPolicyConditionSchema = z.object({
  key: z.string(),
  operator: SupportedOperatorSchema,
  value: z.string(),
});

export const ToolContextLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .refine(
    (value) => !LABEL_RESERVED_CHARS.some((reserved) => value.includes(reserved)),
    {
      message: "Labels cannot contain reserved separator characters",
    },
  );

export const ToolContextLabelsSchema = z
  .array(ToolContextLabelSchema)
  .max(25)
  .refine(
    (labels) =>
      labels.includes(SAFE_TOOL_CONTEXT_LABEL) &&
      labels.includes(SENSITIVE_TOOL_CONTEXT_LABEL),
    {
      message: `Labels must include ${DEFAULT_TOOL_CONTEXT_LABELS.join(" and ")}`,
    },
  );

export const SelectTrustedDataPolicySchema = createSelectSchema(
  schema.trustedDataPoliciesTable,
  {
    conditions: z.array(ResultPolicyConditionSchema),
    matchTemplate: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    action: TrustedDataPolicyActionSchema,
    labels: z.array(ToolContextLabelSchema),
  },
);
export const InsertTrustedDataPolicySchema = createInsertSchema(
  schema.trustedDataPoliciesTable,
  {
    conditions: z.array(ResultPolicyConditionSchema),
    matchTemplate: z.string().min(1).optional(),
    sortOrder: z.number().int().nonnegative().optional(),
    action: TrustedDataPolicyActionSchema,
    labels: z.array(ToolContextLabelSchema).optional(),
  },
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type TrustedDataPolicy = z.infer<typeof SelectTrustedDataPolicySchema>;
export type InsertTrustedDataPolicy = z.infer<
  typeof InsertTrustedDataPolicySchema
>;

export type TrustedDataPolicyAction = z.infer<
  typeof TrustedDataPolicyActionSchema
>;

export type ResultPolicyCondition = z.infer<typeof ResultPolicyConditionSchema>;
