import { Children, isValidElement, useEffect, useId, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

let mermaidLoader: Promise<typeof import("mermaid")["default"]> | null = null;

function loadMermaid() {
  mermaidLoader ??= import("mermaid").then((module) => module.default);
  return mermaidLoader;
}

function mermaidTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

function normalizeMermaidDefinition(definition: string): string {
  // Mermaid 11 reserves `end`, while older examples often use it as a class
  // name. Rename only the style reference and preserve every graph node.
  return definition
    .replace(/^(\s*classDef\s+)end(\s)/gim, "$1endStyle$2")
    .replace(/^(\s*class\s+.+?\s+)end(\s*;?\s*)$/gim, "$1endStyle$2");
}

export function MermaidDiagram({ definition }: { definition: string }) {
  const reactId = useId();
  const renderId = `lmentor-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    setError("");

    void loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: mermaidTheme(),
          fontFamily: "Noto Sans SC, Microsoft YaHei, sans-serif",
        });
        const result = await mermaid.render(renderId, normalizeMermaidDefinition(definition));
        if (!cancelled) setSvg(result.svg);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "流程图语法无法解析。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [definition, renderId]);

  if (error) {
    return (
      <div className="mermaid-diagram mermaid-diagram-error" role="alert">
        <div className="text-sm font-medium">流程图无法解析</div>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div className="mermaid-diagram mermaid-diagram-loading">正在生成流程图...</div>;
  }

  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function textFromChildren(children: ReactNode): string {
  return Children.toArray(children).map((child) => String(child)).join("").replace(/\n$/, "");
}

export function MermaidCode({ className, children }: ComponentPropsWithoutRef<"code">) {
  if (/\blanguage-mermaid\b/.test(className || "")) {
    return <MermaidDiagram definition={textFromChildren(children)} />;
  }
  return <code className={className}>{children}</code>;
}

export function MermaidPre({ children }: ComponentPropsWithoutRef<"pre">) {
  const child = Children.toArray(children)[0];
  if (isValidElement<{ className?: string }>(child) && /\blanguage-mermaid\b/.test(child.props.className || "")) {
    return <>{children}</>;
  }
  return <pre>{children}</pre>;
}

const MERMAID_START = /^\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|sankey-beta|xychart-beta|block-beta|architecture-beta)\b/i;
const MERMAID_LINE = /^(?:\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|sankey-beta|xychart-beta|block-beta|architecture-beta|subgraph|end|classDef|class|style|linkStyle|click|%%)\b|\s*[A-Za-z][\w-]*(?:\s*(?:-->|==>|-.->|---|--)|\s*(?:\[[^\]]*\]|\([^)]+\)|\{[^}]+\})))\s*.*$/;

/** Wrap a standalone Mermaid definition so natural model output still renders. */
export function normalizeMermaidMarkdown(source: string): string {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const normalized: string[] = [];
  let fenced = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      normalized.push(line);
      continue;
    }

    if (fenced || !MERMAID_START.test(line)) {
      normalized.push(line);
      continue;
    }

    const diagram = [line];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor];
      if (candidate.trim()) {
        if (!MERMAID_LINE.test(candidate)) break;
        diagram.push(candidate);
        cursor += 1;
        continue;
      }

      let next = cursor + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (next >= lines.length || !MERMAID_LINE.test(lines[next])) break;
      diagram.push(...lines.slice(cursor, next));
      cursor = next;
    }

    normalized.push("```mermaid", ...diagram, "```");
    index = cursor - 1;
  }

  return normalized.join("\n");
}
