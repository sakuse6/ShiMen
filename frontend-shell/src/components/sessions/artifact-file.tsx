import { useCallback, useMemo, useState } from "react";
import { Download, ExternalLink, FileCode2, FileImage, FileText, FileType2, Presentation } from "lucide-react";
import { useFileViewer } from "@/components/file-viewer";
import { invokeCommand } from "@/hooks/use-invoke";

const ARTIFACT_EXTENSIONS = new Set([
  "md", "markdown", "txt", "pdf", "doc", "docx", "ppt", "pptx", "xlsx", "xls", "csv",
  "svg", "png", "jpg", "jpeg", "gif", "webp", "bmp", "json", "html", "htm",
]);
const TEXT_EXTENSIONS = new Set(["md", "markdown", "txt", "json", "html", "htm", "csv"]);
const IMAGE_EXTENSIONS = new Set(["svg", "png", "jpg", "jpeg", "gif", "webp", "bmp"]);

function extensionOf(value: string) {
  const withoutQuery = value.split(/[?#]/, 1)[0] || "";
  const name = withoutQuery.split(/[\\/]/).pop() || "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function fileNameOf(value: string) {
  return value.split(/[\\/]/).pop() || value;
}

function decodeArtifactHref(href: string) {
  try {
    const url = new URL(href);
    if (url.hostname !== "lmentor.local" || !url.pathname.startsWith("/artifact/")) return null;
    return decodeURIComponent(url.pathname.slice("/artifact/".length));
  } catch {
    return null;
  }
}

function artifactHref(path: string) {
  return `https://lmentor.local/artifact/${encodeURIComponent(path)}`;
}

function isArtifactPath(value: string) {
  return ARTIFACT_EXTENSIONS.has(extensionOf(value));
}

// Keep generated and manually pasted local artifact paths interactive without
// modifying fenced code examples or existing Markdown links.
export function normalizeArtifactMarkdown(markdown: string) {
  const pathPattern = /(?:[A-Za-z]:[\\/]|\.lmentor[\\/]|\.\.?[\\/]|\/)(?:[^\r\n<>:"|?*]+[\\/])*[^\r\n<>:"|?*]+?\.(?:md|markdown|txt|pdf|docx?|pptx?|xlsx?|csv|svg|png|jpe?g|gif|webp|bmp|json|html?)(?=$|[\s),\]}>，。；：])/gi;
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const imagePattern = /!\[[^\]]*\]\([^)]+\)/g;

  return String(markdown || "").split(/(```[\s\S]*?```)/g).map((segment) => {
    if (segment.startsWith("```")) return segment;
    const placeholders: string[] = [];
    const withProtectedImages = segment.replace(imagePattern, (full) => {
      const token = `@@LMENTOR_ARTIFACT_${placeholders.length}@@`;
      placeholders.push(full);
      return token;
    });
    const linked = withProtectedImages.replace(linkPattern, (full, label, rawHref) => {
      const localPath = rawHref.trim().replace(/^<|>$/g, "");
      if (!isArtifactPath(localPath) || /^https?:\/\//i.test(localPath)) return full;
      const token = `@@LMENTOR_ARTIFACT_${placeholders.length}@@`;
      placeholders.push(`[${label}](${artifactHref(localPath)})`);
      return token;
    });
    const normalized = linked.replace(pathPattern, (localPath) => {
      if (!isArtifactPath(localPath)) return localPath;
      return `[${fileNameOf(localPath)}](${artifactHref(localPath)})`;
    });
    return normalized.replace(/@@LMENTOR_ARTIFACT_(\d+)@@/g, (_, index) => placeholders[Number(index)] || "");
  }).join("");
}

function ArtifactIcon({ extension }: { extension: string }) {
  if (IMAGE_EXTENSIONS.has(extension)) return <FileImage className="h-5 w-5" />;
  if (extension === "pdf") return <FileType2 className="h-5 w-5" />;
  if (extension === "ppt" || extension === "pptx") return <Presentation className="h-5 w-5" />;
  if (TEXT_EXTENSIONS.has(extension)) return <FileCode2 className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export function ArtifactFileCard({ path, label }: { path: string; label?: string }) {
  const { openViewer } = useFileViewer();
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const extension = extensionOf(path);
  const displayName = label?.trim() || fileNameOf(path);
  const canPreview = TEXT_EXTENSIONS.has(extension) || IMAGE_EXTENSIONS.has(extension) || extension === "pdf";
  const isProminent = extension === "svg";

  const openSystem = useCallback(async () => {
    setBusy("open");
    try {
      await invokeCommand<void>("open_file_with_system", { path });
    } finally {
      setBusy(null);
    }
  }, [path]);

  const download = useCallback(async () => {
    setBusy("download");
    try {
      const base64 = await invokeCommand<string>("read_file_as_base64", { path });
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameOf(path);
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }, [path]);

  return (
    <span className={`artifact-file-card ${isProminent ? "artifact-file-card-prominent" : ""}`}>
      <button
        type="button"
        className="artifact-file-card-main"
        onClick={() => canPreview ? openViewer({ kind: "file", path }) : void openSystem()}
        title={path}
      >
        <span className="artifact-file-card-icon"><ArtifactIcon extension={extension} /></span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium">{displayName}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{extension.toUpperCase() || "FILE"} 成果文件</span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <span className="artifact-file-card-actions">
        {canPreview && <button type="button" onClick={() => openViewer({ kind: "file", path })}>预览</button>}
        <button type="button" disabled={busy !== null} onClick={() => void openSystem()}>{busy === "open" ? "正在打开" : "系统打开"}</button>
        <button type="button" disabled={busy !== null} onClick={() => void download()}><Download className="h-3.5 w-3.5" />{busy === "download" ? "正在下载" : "下载"}</button>
      </span>
    </span>
  );
}

export function ArtifactMarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const path = href ? decodeArtifactHref(href) : null;
  const label = useMemo(() => Array.isArray(children) ? children.join("") : String(children || ""), [children]);
  if (path) return <ArtifactFileCard path={path} label={label} />;
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}
