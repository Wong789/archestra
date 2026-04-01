/**
 * Delimiter used to separate multiple values within a single label key
 * in the labels query parameter. Pipe is used instead of comma because
 * label values themselves may contain commas.
 * Format: key1:val1|val2;key2:val3
 */
export const LABELS_VALUE_DELIMITER = "|";

/**
 * Delimiter used to separate label key:value groups in the labels query parameter.
 * Format: key1:val1|val2;key2:val3
 */
export const LABELS_ENTRY_DELIMITER = ";";

/**
 * Characters reserved for the labels query parameter format.
 * Label keys and values must not contain any of these.
 */
export const LABEL_RESERVED_CHARS: string[] = [
  LABELS_VALUE_DELIMITER,
  LABELS_ENTRY_DELIMITER,
  ":",
];

/**
 * Default policy labels attached to tool output context.
 * `sensitive` preserves the existing trust boundary semantics.
 */
export const DEFAULT_TOOL_CONTEXT_LABELS = ["safe", "sensitive"] as const;
export const SENSITIVE_TOOL_CONTEXT_LABEL = "sensitive";
export const SAFE_TOOL_CONTEXT_LABEL = "safe";
