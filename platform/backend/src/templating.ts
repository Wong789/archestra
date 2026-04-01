import Handlebars from "handlebars";
import { get } from "lodash-es";
import logger from "@/logging";

/**
 * Register custom Handlebars helpers for template rendering
 */
Handlebars.registerHelper("json", (context) => {
  // If context is a string, try to parse it as JSON
  if (typeof context === "string") {
    try {
      return JSON.parse(context);
    } catch {
      // If not valid JSON, return the string as-is
      return context;
    }
  }
  // If context is an object, stringify it
  return JSON.stringify(context);
});

// Helper to escape strings for use in JSON
Handlebars.registerHelper("escapeJson", (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
});

/**
 * SSO-specific Handlebars helpers
 */

// Check if an array includes a value (case-insensitive for strings)
Handlebars.registerHelper(
  "includes",
  function (
    this: unknown,
    array: unknown,
    value: unknown,
    options: Handlebars.HelperOptions,
  ) {
    if (!Array.isArray(array)) return options.inverse(this);
    const found = array.some((item) => {
      if (typeof item === "string" && typeof value === "string") {
        return item.toLowerCase() === value.toLowerCase();
      }
      return item === value;
    });
    return found ? options.fn(this) : options.inverse(this);
  },
);

// Check if a string contains a substring (case-insensitive)
Handlebars.registerHelper(
  "contains",
  function (
    this: unknown,
    str: unknown,
    substring: unknown,
    options: Handlebars.HelperOptions,
  ) {
    if (typeof str !== "string" || typeof substring !== "string") {
      return options.inverse(this);
    }
    return str.toLowerCase().includes(substring.toLowerCase())
      ? options.fn(this)
      : options.inverse(this);
  },
);

// Check equality
Handlebars.registerHelper(
  "equals",
  function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions,
  ) {
    if (typeof a === "string" && typeof b === "string") {
      return a.toLowerCase() === b.toLowerCase()
        ? options.fn(this)
        : options.inverse(this);
    }
    return a === b ? options.fn(this) : options.inverse(this);
  },
);

// Logical AND
Handlebars.registerHelper("and", function (this: unknown, ...args: unknown[]) {
  const options = args.pop() as Handlebars.HelperOptions;
  return args.every(Boolean) ? options.fn(this) : options.inverse(this);
});

// Logical OR
Handlebars.registerHelper("or", function (this: unknown, ...args: unknown[]) {
  const options = args.pop() as Handlebars.HelperOptions;
  return args.some(Boolean) ? options.fn(this) : options.inverse(this);
});

// Not equal
Handlebars.registerHelper(
  "notEquals",
  function (
    this: unknown,
    a: unknown,
    b: unknown,
    options: Handlebars.HelperOptions,
  ) {
    if (typeof a === "string" && typeof b === "string") {
      return a.toLowerCase() !== b.toLowerCase()
        ? options.fn(this)
        : options.inverse(this);
    }
    return a !== b ? options.fn(this) : options.inverse(this);
  },
);

// Check if value exists (not null/undefined)
Handlebars.registerHelper(
  "exists",
  function (this: unknown, value: unknown, options: Handlebars.HelperOptions) {
    return value !== null && value !== undefined
      ? options.fn(this)
      : options.inverse(this);
  },
);

// Extract a property from each item in an array
Handlebars.registerHelper("pluck", (array, property) => {
  if (!Array.isArray(array)) return [];
  return array
    .map((item) => (typeof item === "object" && item ? item[property] : null))
    .filter((v) => v !== null && v !== undefined);
});

/**
 * Policy template helpers
 */

Handlebars.registerHelper("all", (...args) => {
  const values = args.slice(0, -1);
  return values.every(Boolean);
});

Handlebars.registerHelper("any", (...args) => {
  const values = args.slice(0, -1);
  return values.some(Boolean);
});

Handlebars.registerHelper("eq", (a, b) => comparePolicyValue(a, "equal", b));
Handlebars.registerHelper("ne", (a, b) => comparePolicyValue(a, "notEqual", b));
Handlebars.registerHelper("containsText", (a, b) =>
  comparePolicyValue(a, "contains", b),
);
Handlebars.registerHelper("notContainsText", (a, b) =>
  comparePolicyValue(a, "notContains", b),
);
Handlebars.registerHelper("startsWithText", (a, b) =>
  comparePolicyValue(a, "startsWith", b),
);
Handlebars.registerHelper("endsWithText", (a, b) =>
  comparePolicyValue(a, "endsWith", b),
);
Handlebars.registerHelper("matchesRegex", (a, b) =>
  comparePolicyValue(a, "regex", b),
);

Handlebars.registerHelper("hasLabel", function (...args) {
  const options = args.pop() as Handlebars.HelperOptions;
  const [labelsOrLabel, maybeLabel] = args;
  const labels = Array.isArray(labelsOrLabel)
    ? labelsOrLabel
    : get(options.data.root, "labels", []);
  const label = Array.isArray(labelsOrLabel) ? maybeLabel : labelsOrLabel;

  return Array.isArray(labels) && typeof label === "string"
    ? labels.includes(label)
    : false;
});

Handlebars.registerHelper("matchInput", (input, path, operator, value) =>
  matchByPath(input, path, operator, value),
);
Handlebars.registerHelper("matchOutput", (output, path, operator, value) =>
  matchByPath(output, path, operator, value),
);
Handlebars.registerHelper("matchContext", (context, key, operator, value) =>
  matchContextValue(context, key, operator, value),
);

/**
 * System prompt template helpers
 */

// Returns the current date in YYYY-MM-DD format (UTC)
Handlebars.registerHelper("currentDate", () => {
  return new Date().toISOString().split("T")[0];
});

// Returns the current time in HH:MM:SS UTC format
Handlebars.registerHelper("currentTime", () => {
  return `${new Date().toISOString().split("T")[1].split(".")[0]} UTC`;
});

/**
 * Context for rendering system prompt templates
 */
export interface SystemPromptContext {
  user: {
    name: string;
    email: string;
    teams: string[];
  };
}

/**
 * Check if any of the given prompt strings contain Handlebars syntax (`{{`).
 * Used to skip unnecessary DB queries (e.g. fetching user teams) when no
 * templating is needed.
 */
export function promptNeedsRendering(
  ...prompts: (string | null | undefined)[]
): boolean {
  return prompts.some((p) => p?.includes("{{"));
}

/**
 * Render an agent's system prompt, applying Handlebars template variables
 * (e.g. {{user.name}}) when present. Returns null if no system prompt is set.
 * If the template fails to compile or render, returns the original string unchanged.
 */
export function renderSystemPrompt(
  systemPrompt: string | null,
  context?: SystemPromptContext | null,
): string | null {
  if (!systemPrompt) {
    return null;
  } else if (!context) {
    return systemPrompt;
  }

  try {
    const template = Handlebars.compile(systemPrompt, { noEscape: true });
    return template(context);
  } catch (error) {
    logger.warn(
      { err: error },
      "Failed to render system prompt template, using raw template string",
    );
    return systemPrompt;
  }
}

/**
 * Evaluate a Handlebars template for SSO role mapping.
 * Returns true if the template renders to a truthy value (non-empty string).
 *
 * @param templateString - Handlebars template that should render to "true" or truthy content when matched
 * @param context - SSO claims data to evaluate against
 * @returns true if the template renders to a non-empty/truthy string
 */
export function evaluateRoleMappingTemplate(
  templateString: string,
  context: Record<string, unknown>,
): boolean {
  try {
    const template = Handlebars.compile(templateString, { noEscape: true });
    const result = template(context).trim();
    // Consider any non-empty string as truthy
    return result.length > 0 && result !== "false" && result !== "0";
  } catch {
    return false;
  }
}

/**
 * Extract group identifiers from SSO claims using a Handlebars template.
 * The template should render to a comma-separated list or JSON array of group names.
 *
 * @param templateString - Handlebars template that extracts group identifiers
 * @param context - SSO claims data
 * @returns Array of group identifier strings
 * @throws Error if the template fails to compile (allows caller to fall back)
 */
export function extractGroupsWithTemplate(
  templateString: string,
  context: Record<string, unknown>,
): string[] {
  // Compile template - let this throw on syntax errors so caller can fall back
  const template = Handlebars.compile(templateString, { noEscape: true });

  try {
    const result = template(context).trim();

    if (!result) return [];

    // Try to parse as JSON array first
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v) => typeof v === "string" && v.trim())
          .map((v) => v.trim());
      }
    } catch {
      // Not JSON, treat as comma-separated
    }

    // Split by comma and clean up
    return result
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    // Runtime error during template execution
    return [];
  }
}

/**
 * Evaluate a Handlebars policy template.
 * Returns false for invalid templates or runtime failures.
 */
export function evaluatePolicyTemplate(
  templateString: string,
  context: Record<string, unknown>,
): boolean {
  const trimmedTemplate = templateString.trim();
  if (trimmedTemplate === "{{true}}" || trimmedTemplate === "true") {
    return true;
  }

  try {
    const template = Handlebars.compile(templateString, { noEscape: true });
    const result = template(context).trim();
    return result.length > 0 && result !== "false" && result !== "0";
  } catch (error) {
    logger.warn(
      { err: error, templateString },
      "Failed to evaluate policy template",
    );
    return false;
  }
}

function comparePolicyValue(
  actual: unknown,
  operator: string,
  expected: unknown,
): boolean {
  if (actual === undefined || actual === null) {
    return false;
  }

  switch (operator) {
    case "startsWith":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.startsWith(expected)
      );
    case "endsWith":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.endsWith(expected)
      );
    case "contains":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        actual.includes(expected)
      );
    case "notContains":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        !actual.includes(expected)
      );
    case "notEqual":
      return actual !== expected;
    case "regex":
      return (
        typeof actual === "string" &&
        typeof expected === "string" &&
        new RegExp(expected.replaceAll("\\\\", "\\")).test(actual)
      );
    case "equal":
    default:
      return actual === expected;
  }
}

function matchByPath(
  source: unknown,
  path: unknown,
  operator: unknown,
  expected: unknown,
): boolean {
  if (typeof path !== "string" || typeof operator !== "string") {
    return false;
  }

  const values = extractValuesFromPath(source, path);
  if (values.length === 0) {
    return false;
  }

  return values.every((value) => comparePolicyValue(value, operator, expected));
}

function matchContextValue(
  context: unknown,
  key: unknown,
  operator: unknown,
  expected: unknown,
): boolean {
  if (
    typeof key !== "string" ||
    typeof operator !== "string" ||
    typeof expected !== "string" ||
    !context ||
    typeof context !== "object"
  ) {
    return false;
  }

  const actual = get(context, key);
  if (Array.isArray(actual)) {
    if (operator === "contains") {
      return actual.includes(expected);
    }
    if (operator === "notContains") {
      return !actual.includes(expected);
    }
    return false;
  }

  return comparePolicyValue(actual, operator, expected);
}

function extractValuesFromPath(source: unknown, path: string): unknown[] {
  if (path.includes("[*]")) {
    const [arrayPath, itemPath] = path.split("[*].");
    const array = get(source, arrayPath);
    if (!Array.isArray(array)) {
      return [];
    }

    if (!itemPath) {
      return array;
    }

    return array
      .map((item) => get(item, itemPath))
      .filter((value) => value !== undefined);
  }

  const value = get(source, path);
  return value === undefined ? [] : [value];
}
