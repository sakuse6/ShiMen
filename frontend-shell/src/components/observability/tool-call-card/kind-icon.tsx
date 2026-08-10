import {
  FileText,
  FilePen,
  FilePlus,
  FileX,
  Terminal,
  Search,
  Globe,
  Brain,
  Bot,
  Sparkles,
  Wrench,
} from "lucide-react";
import type { ToolKind } from "./types";

const kindConfig: Record<ToolKind, { icon: typeof FileText; label: string; bgVar: string }> = {
  file_read: { icon: FileText, label: "读取", bgVar: "--tool-bg-file-read" },
  file_edit: { icon: FilePen, label: "编辑", bgVar: "--tool-bg-file-edit" },
  file_write: { icon: FilePlus, label: "写入", bgVar: "--tool-bg-file-write" },
  file_delete: { icon: FileX, label: "删除", bgVar: "--tool-bg-file-delete" },
  shell_exec: { icon: Terminal, label: "命令", bgVar: "--tool-bg-shell" },
  search: { icon: Search, label: "搜索", bgVar: "--tool-bg-search" },
  web: { icon: Globe, label: "网页", bgVar: "--tool-bg-web" },
  skill: { icon: Sparkles, label: "Skill", bgVar: "--tool-bg-think" },
  think: { icon: Brain, label: "思考", bgVar: "--tool-bg-think" },
  subtask: { icon: Bot, label: "任务", bgVar: "--tool-bg-subtask" },
  other: { icon: Wrench, label: "工具", bgVar: "--tool-bg-other" },
};

export function KindIcon({ kind }: { kind: ToolKind }) {
  const config = kindConfig[kind] ?? kindConfig.other;
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-[6px] border border-border/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      style={{ background: `var(${config.bgVar})` }}
    >
      <Icon className="w-[1.05em] h-[1.05em] text-[var(--color-foreground)]" />
    </span>
  );
}

export function kindLabel(kind: ToolKind): string {
  return kindConfig[kind]?.label ?? "工具";
}
