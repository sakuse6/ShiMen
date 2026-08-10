import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Cable,
  FolderOpen,
  LayoutDashboard,
  MessagesSquare,
  PlugZap,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ManageTab, Project } from "@/types";
import { ConfigPage } from "./config-page";
import { EnhancementsPage } from "./enhancements-page";
import { EnvCheckPage } from "./env-check-page";
import { OverviewPage } from "./overview-page";
import { ProjectsPage } from "./projects-page";
import { ProvidersPage } from "./providers-page";
import { RosterPage } from "./roster-page";
import { SessionsPage } from "./sessions-page";
import { ToolsPluginsPage } from "./tools-plugins-page";

interface ManagePageProps {
  onBack: () => void;
  onEnterProject: (project: Project) => void;
  onReopenGuide?: () => void;
  navigateToProjects?: number;
  openProjectCreatorKey?: number;
  forcedTab?: ManageTab | null;
  providersGuideApiDialogOpen?: boolean;
}

const tabs: Array<{ id: ManageTab; label: string; icon: typeof FolderOpen; iconColor: string }> = [
  { id: "overview", label: "概况", icon: LayoutDashboard, iconColor: "text-[var(--icon-about)]" },
  { id: "roster", label: "名册", icon: Users, iconColor: "text-[var(--icon-action)]" },
  { id: "projects", label: "项目", icon: FolderOpen, iconColor: "text-[var(--icon-folder)]" },
  { id: "sessions", label: "会话", icon: MessagesSquare, iconColor: "text-[var(--icon-config)]" },
  { id: "providers", label: "供应商", icon: Cable, iconColor: "text-[var(--icon-action)]" },
  { id: "tools", label: "工具", icon: PlugZap, iconColor: "text-[var(--icon-action)]" },
  { id: "enhancements", label: "增强", icon: Sparkles, iconColor: "text-[var(--icon-theme)]" },
  { id: "config", label: "配置", icon: Settings, iconColor: "text-[var(--icon-action)]" },
  { id: "environment", label: "环境", icon: Activity, iconColor: "text-[var(--icon-env)]" },
];

export function ManagePage({
  onBack,
  onEnterProject,
  onReopenGuide,
  navigateToProjects,
  openProjectCreatorKey,
  forcedTab,
  providersGuideApiDialogOpen = false,
}: ManagePageProps) {
  const [activeTab, setActiveTab] = useState<ManageTab>("overview");
  const prevNavigateRef = useRef(0);
  const prevProjectCreatorRef = useRef(0);

  useEffect(() => {
    if (!forcedTab) return;
    setActiveTab(forcedTab);
  }, [forcedTab]);

  useEffect(() => {
    if (navigateToProjects && navigateToProjects !== prevNavigateRef.current) {
      prevNavigateRef.current = navigateToProjects;
      setActiveTab("projects");
    }
  }, [navigateToProjects]);

  useEffect(() => {
    if (openProjectCreatorKey && openProjectCreatorKey !== prevProjectCreatorRef.current) {
      prevProjectCreatorRef.current = openProjectCreatorKey;
      setActiveTab("projects");
    }
  }, [openProjectCreatorKey]);

  return (
    <div className="flex h-full">
      <aside
        className="flex w-16 flex-col items-center gap-1 border-r border-border/30 py-4"
        style={{ background: "var(--color-layer-1)" }}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setActiveTab("overview");
            onBack();
          }}
          className="mb-4 text-muted-foreground hover:text-foreground"
          title="返回对话"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onReopenGuide}
          className="mb-2 text-muted-foreground hover:text-foreground"
          title="重新查看新手引导"
        >
          <Sparkles className="h-4 w-4" />
        </Button>

        {tabs.map(({ id, label, icon: Icon, iconColor }) => (
          <button
            key={id}
            type="button"
            title={label}
            data-guide-id={id === "providers" ? "manage-providers-tab" : undefined}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex w-12 flex-col items-center gap-1 rounded-lg py-2 text-xs transition-fast",
              activeTab === id
                ? "bg-accent/80 font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
            )}
          >
            <Icon className={cn("h-4 w-4", activeTab !== id && iconColor)} />
            <span className="w-full truncate text-center">{label}</span>
          </button>
        ))}
      </aside>

      <main className="flex-1 overflow-y-auto">
        {activeTab === "overview" && <OverviewPage />}
        {activeTab === "roster" && <RosterPage />}
        {activeTab === "projects" && <ProjectsPage onEnterProject={onEnterProject} openCreatorKey={openProjectCreatorKey} />}
        {activeTab === "sessions" && <SessionsPage onEnterProject={onEnterProject} />}
        {activeTab === "providers" && <ProvidersPage guideApiDialogOpen={providersGuideApiDialogOpen} />}
        {activeTab === "tools" && <ToolsPluginsPage />}
        {activeTab === "enhancements" && <EnhancementsPage />}
        {activeTab === "config" && <ConfigPage initialTab="edit" />}
        {activeTab === "environment" && <EnvCheckPage />}
      </main>
    </div>
  );
}
