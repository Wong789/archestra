"use client";

import { POLICY_TEMPLATE_EXPRESSIONS } from "@shared";
import { Editor } from "@/components/editor";
import {
  computeHandlebarsReplaceOffsets,
  shouldShowHandlebarsCompletions,
} from "@/lib/utils/handlebars-completion";

type Monaco = Parameters<
  NonNullable<import("@monaco-editor/react").EditorProps["beforeMount"]>
>[0];

let completionsRegistered = false;

export function PolicyTemplateEditor({
  value,
  onChange,
  height = "96px",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}) {
  return (
    <div className="border rounded-md overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="handlebars"
        value={value}
        onChange={(next) => onChange(next || "")}
        beforeMount={(monaco) => {
          registerPolicyTemplateCompletions(monaco);
        }}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "off",
          scrollBeyondLastLine: false,
          scrollbar: { alwaysConsumeMouseWheel: false },
          wordWrap: "on",
          automaticLayout: true,
          placeholder,
          quickSuggestions: false,
          wordBasedSuggestions: "off",
          editContext: false,
        }}
      />
    </div>
  );
}

function registerPolicyTemplateCompletions(monaco: Monaco) {
  if (completionsRegistered) return;
  completionsRegistered = true;

  // biome-ignore lint/suspicious/noExplicitAny: Monaco namespace types aren't directly indexable
  const provideCompletionItems = (model: any, position: any) => {
    const lineContent = model.getLineContent(position.lineNumber) as string;
    const col = position.column as number;
    const textBeforeCursor = lineContent.substring(0, col - 1);
    const textAfterCursor = lineContent.substring(col - 1);

    if (!shouldShowHandlebarsCompletions(textBeforeCursor)) {
      return { suggestions: [] };
    }

    const { startOffset, endOffset } = computeHandlebarsReplaceOffsets(
      textBeforeCursor,
      textAfterCursor,
    );
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: col - startOffset,
      endColumn: col + endOffset,
    };

    return {
      suggestions: POLICY_TEMPLATE_EXPRESSIONS.map((item) => ({
        label: item.expression,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: item.expression,
        detail: item.description,
        range,
      })),
    };
  };

  monaco.languages.registerCompletionItemProvider("handlebars", {
    triggerCharacters: ["{"],
    provideCompletionItems,
  });
}
