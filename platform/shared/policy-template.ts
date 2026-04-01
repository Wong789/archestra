/**
 * Template variables and helpers available in tool policy editors.
 * Used by both backend evaluation and frontend Monaco completions.
 */

export const POLICY_TEMPLATE_VARIABLES = [
  {
    expression: "{{tool.name}}",
    description: "Current tool name",
  },
  {
    expression: "{{input}}",
    description: "Tool input object for access rules",
  },
  {
    expression: "{{output}}",
    description: "Tool output object for result rules",
  },
  {
    expression: "{{context.externalAgentId}}",
    description: "External agent identifier from the request, if present",
  },
  {
    expression: "{{context.teamIds}}",
    description: "Team IDs assigned to the agent",
  },
  {
    expression: "{{labels}}",
    description: "Current context labels accumulated from prior tool outputs",
  },
] as const;

export const POLICY_TEMPLATE_HELPERS = [
  {
    expression: '{{hasLabel labels "sensitive"}}',
    description: "True when the context already has the given label",
  },
  {
    expression:
      '{{matchInput input "path" "startsWith" "/etc"}}',
    description: "Compare a tool input field using the legacy operator set",
  },
  {
    expression:
      '{{matchOutput output "emails[*].from" "endsWith" "@company.com"}}',
    description: "Compare a tool output field, including wildcard array paths",
  },
  {
    expression:
      '{{matchContext context "teamIds" "contains" "team-id"}}',
    description: "Compare request context values such as team IDs",
  },
  {
    expression:
      '{{all (hasLabel labels "sensitive") (matchInput input "path" "startsWith" "/tmp")}}',
    description: "Combine multiple checks with logical AND",
  },
  {
    expression:
      '{{any (hasLabel labels "pii") (hasLabel labels "customer-data")}}',
    description: "Combine multiple checks with logical OR",
  },
] as const;

export const POLICY_TEMPLATE_EXPRESSIONS = [
  ...POLICY_TEMPLATE_VARIABLES,
  ...POLICY_TEMPLATE_HELPERS,
] as const;
