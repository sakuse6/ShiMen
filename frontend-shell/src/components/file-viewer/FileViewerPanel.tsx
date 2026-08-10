import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { FileText, GitCompare, Loader2, X } from "lucide-react";
import { invokeCommand } from "@/hooks/use-invoke";
import { cn } from "@/lib/utils";
import type { DiffPreview, DiffRow } from "@/lib/text-preview";

export type ViewerTarget =
  | { kind: "file"; path: string; line?: number }
  | { kind: "diff"; path: string; diff?: DiffPreview | null }
  | { kind: "history"; path: string };

interface FileViewerContextValue {
  open: boolean;
  target: ViewerTarget | null;
  openViewer: (target: ViewerTarget) => void;
  closeViewer: () => void;
}

interface TextFilePreview {
  path: string;
  content: string;
  truncated: boolean;
  size: number;
}

function fileExtension(path: string) {
  const name = path.split(/[\\/]/).pop() || "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

const imageExtensions = new Set(["svg", "png", "jpg", "jpeg", "gif", "webp", "bmp"]);

const FileViewerContext = createContext<FileViewerContextValue>(null!);

export function FileViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ViewerTarget | null>(null);
  const [content, setContent] = useState<TextFilePreview | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "pdf" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"preview" | "diff">("preview");

  const openViewer = useCallback((t: ViewerTarget) => {
    setTarget(t);
    setTab(t.kind === "diff" ? "diff" : "preview");
    setOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setOpen(false);
    setTarget(null);
  }, []);

  useEffect(() => {
    if (!open || !target?.path) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setMediaUrl(null);
    setMediaType(null);

    const extension = fileExtension(target.path);
    const command = imageExtensions.has(extension) ? "read_image_as_data_url" : extension === "pdf" ? "read_file_as_data_url" : "read_text_file";
    invokeCommand<TextFilePreview | string>(command, { path: target.path })
      .then((result) => {
        if (cancelled) return;
        if (typeof result === "string") {
          setMediaUrl(result);
          setMediaType(extension === "pdf" ? "pdf" : "image");
        } else {
          setContent(result);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, target?.path]);

  const diff = target?.kind === "diff" ? target.diff : null;

  return (
    <FileViewerContext.Provider value={{ open, target, openViewer, closeViewer }}>
      {children}
      {open && target && (
        <div className="fixed right-0 top-11 bottom-6 z-40 flex w-[min(560px,44vw)] min-w-[420px] flex-col border-l border-border bg-[var(--color-card)] shadow-lg">
          <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-[var(--icon-action)]" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium" title={target.path}>
              {target.path}
            </span>
            <button
              onClick={closeViewer}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-1 border-b border-border/30 px-3 pt-2">
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")} icon={<FileText className="h-3.5 w-3.5" />}>
              {"\u9884\u89c8"}
            </TabButton>
            {target.kind === "diff" && (
              <TabButton active={tab === "diff"} onClick={() => setTab("diff")} icon={<GitCompare className="h-3.5 w-3.5" />}>
                {"\u53d8\u66f4"}
              </TabButton>
            )}
          </div>

          <div className="flex-1 overflow-auto bg-background/35">
            {tab === "diff" && target.kind === "diff" ? (
              diff ? <DiffTable diff={diff} /> : <EmptyState text={"\u6ca1\u6709\u53ef\u5c55\u793a\u7684\u53d8\u66f4\u6bd4\u5bf9"} />
            ) : loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {"\u6b63\u5728\u8bfb\u53d6\u6587\u672c..."}
              </div>
            ) : error ? (
              <EmptyState text={error} />
            ) : mediaType === "image" && mediaUrl ? (
              <div className="flex min-h-full items-center justify-center p-4">
                <img src={mediaUrl} alt={target.path} className="max-h-full max-w-full rounded border border-border/50 bg-background" />
              </div>
            ) : mediaType === "pdf" && mediaUrl ? (
              <iframe title={target.path} src={mediaUrl} className="h-full w-full border-0" />
            ) : content ? (
              <TextPreview content={content.content} truncated={content.truncated} />
            ) : (
              <EmptyState text={"\u6ca1\u6709\u53ef\u9884\u89c8\u7684\u6587\u672c\u5185\u5bb9"} />
            )}
          </div>
        </div>
      )}
    </FileViewerContext.Provider>
  );
}

function TabButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-t-lg px-3 py-1.5 text-sm transition-fast",
        active
          ? "border-b-2 border-foreground bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TextPreview({ content, truncated }: { content: string; truncated: boolean }) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return (
    <div className="font-mono text-[var(--font-size-prose)]">
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[3.5rem_minmax(0,1fr)]">
          <span className="select-none border-r border-border/35 px-3 py-0.5 text-right text-muted-foreground/70">
            {index + 1}
          </span>
          <span className="whitespace-pre px-3 py-0.5 text-foreground/80">{line || " "}</span>
        </div>
      ))}
      {truncated && (
        <div className="border-t border-border/40 px-3 py-2 text-sm text-muted-foreground">
          {"\u5185\u5bb9\u8fc7\u957f\uff0c\u5df2\u622a\u65ad\u663e\u793a\u3002"}
        </div>
      )}
    </div>
  );
}

function DiffTable({ diff }: { diff: DiffPreview }) {
  return (
    <div className="font-mono text-[var(--font-size-prose)]">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/40 bg-[var(--color-card)] px-3 py-2">
        <FileText className="h-4 w-4 text-[var(--icon-action)]" />
        <span className="flex-1 truncate font-sans text-sm font-medium">{diff.fileName}</span>
        <span className="font-sans text-sm font-semibold text-green-600">+{diff.added}</span>
        <span className="font-sans text-sm font-semibold text-red-600">-{diff.removed}</span>
      </div>
      <div className="inline-block min-w-full">
        {diff.rows.map((row, index) => (
          <DiffLine key={index} row={row} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ row }: { row: DiffRow }) {
  return (
    <div
      className={cn(
        "grid min-w-full grid-cols-[3rem_3rem_max-content]",
        row.kind === "add" && "bg-[var(--diff-added)] text-[var(--diff-added-fg)]",
        row.kind === "remove" && "bg-[var(--diff-removed)] text-[var(--diff-removed-fg)]",
      )}
    >
      <span className="select-none border-r border-border/25 px-2 py-0.5 text-right text-muted-foreground/70">
        {row.oldLine ?? ""}
      </span>
      <span className="select-none border-r border-border/25 px-2 py-0.5 text-right text-muted-foreground/70">
        {row.newLine ?? ""}
      </span>
      <span className="whitespace-pre px-3 py-0.5">
        {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}
        {row.text || " "}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function useFileViewer() {
  return useContext(FileViewerContext);
}
