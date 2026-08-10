import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, FolderOpen, Plus, RotateCw, Search, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvoke } from "@/hooks/use-invoke";
import { useAgent } from "@/agents";
import { AddProjectDialog } from "@/components/projects/add-project-dialog";
import { MergeDialog } from "@/components/projects/merge-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectDetail } from "@/components/projects/project-detail";
import { listen } from "@/lmentor/platform/event";
import type { Project, ProjectMergeInfo, ProjectMeta } from "@/types";

interface ProjectsPageProps {
  onEnterProject?: (project: Project) => void;
  openCreatorKey?: number;
}

export function ProjectsPage({ onEnterProject, openCreatorKey }: ProjectsPageProps) {
  const { t } = useTranslation();
  const { agents, activeId } = useAgent();
  const { data: projects, loading, refetch } = useInvoke<Project[]>("scan_projects");
  const { data: projectMetas, refetch: refetchMetas } = useInvoke<Record<string, ProjectMeta>>("load_project_metas");
  const { data: merges, refetch: refetchMerges } = useInvoke<ProjectMergeInfo>("get_project_merges");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [managementMode, setManagementMode] = useState(false);
  const [checkedProjects, setCheckedProjects] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [lastOpenCreatorKey, setLastOpenCreatorKey] = useState(0);

  const allTags = useMemo(() => {
    if (!projectMetas) return [];
    const tagSet = new Set<string>();
    Object.values(projectMetas).forEach((meta) => meta.tags?.forEach((tag) => tagSet.add(tag)));
    return [...tagSet].sort();
  }, [projectMetas]);

  const projectAgentIds = useMemo(() => {
    const ids = new Set<string>();
    (projects ?? []).forEach((project) => {
      (project.agent_ids ?? []).forEach((id) => ids.add(id));
    });
    return ids;
  }, [projects]);

  const filterAgents = useMemo(
    () => agents.filter((agent) => agent.health.installed || projectAgentIds.has(agent.id)),
    [agents, projectAgentIds],
  );

  useEffect(() => {
    if (selectedAgent !== "all" && !filterAgents.some((agent) => agent.id === selectedAgent)) {
      setSelectedAgent("all");
    }
  }, [filterAgents, selectedAgent]);

  useEffect(() => {
    if (!openCreatorKey || openCreatorKey === lastOpenCreatorKey) return;
    setLastOpenCreatorKey(openCreatorKey);
    setAddDialogOpen(true);
  }, [lastOpenCreatorKey, openCreatorKey]);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | null = null;

    listen("workspace-data-changed", async () => {
      if (cancelled) return;
      await Promise.all([
        refetch(true),
        refetchMetas(true),
        refetchMerges(true),
      ]);
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    }).catch(console.error);

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [refetch, refetchMetas, refetchMerges]);

  const filteredProjects = useMemo(() => {
    let result = projects ?? [];

    if (selectedTag) {
      result = result.filter((project) => projectMetas?.[project.encoded_name]?.tags?.includes(selectedTag));
    }

    if (selectedAgent !== "all") {
      result = result.filter((project) => (project.agent_ids ?? []).includes(selectedAgent));
    }

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter((project) => {
        const meta = projectMetas?.[project.encoded_name];
        const name = (meta?.custom_name || project.name).toLowerCase();
        const tags = meta?.tags?.map((tag) => tag.toLowerCase()) ?? [];
        return name.includes(query) || tags.some((tag) => tag.includes(query)) || project.path.toLowerCase().includes(query);
      });
    }

    return result;
  }, [projects, selectedTag, selectedAgent, searchQuery, projectMetas]);

  function handleToggleManagementMode() {
    setManagementMode((prev) => !prev);
    setCheckedProjects(new Set());
  }

  function handleProjectAdded() {
    refetch();
  }

  function handleCheck(encodedName: string) {
    setCheckedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(encodedName)) next.delete(encodedName);
      else next.add(encodedName);
      return next;
    });
  }

  function handleMergeComplete() {
    refetch();
    refetchMerges();
    setCheckedProjects(new Set());
    setManagementMode(false);
  }

  function getMergedCount(encodedName: string): number {
    if (!merges || !merges[encodedName]) return 0;
    return merges[encodedName].length;
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-6 overflow-auto p-6 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t("projects.title")}</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              refetch();
              refetchMetas();
              refetchMerges();
            }}
            title={t("projects.refresh")}
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleManagementMode}>
            <Settings2 className="mr-1 h-4 w-4" />
            {managementMode ? "退出管理" : "管理"}
          </Button>
          <Button className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("projects.addProject")}
          </Button>
        </div>
      </div>

      {projects && projects.length > 0 ? (
        <div className="flex flex-col items-center gap-4 pt-1">
          <div className="flex w-full flex-col items-center gap-3">
            <div className="relative w-full max-w-xl">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("projects.search")}
                className="h-9 rounded-[10px] border-border/70 bg-background/80 pl-8 text-sm shadow-sm"
              />
            </div>

            {filterAgents.length > 0 ? (
              <div className="flex max-w-3xl flex-wrap items-center justify-center gap-1.5 rounded-[10px] border border-border/70 bg-muted/35 p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setSelectedAgent("all")}
                  className={`inline-flex h-7 items-center rounded-[7px] px-3 text-xs font-medium transition-colors ${
                    selectedAgent === "all"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                  }`}
                >
                  {t("projects.allAgents")}
                </button>

                {filterAgents.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setSelectedAgent(selectedAgent === agent.id ? "all" : agent.id)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] px-3 text-xs font-medium transition-colors ${
                      selectedAgent === agent.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    }`}
                  >
                    {agent.id === activeId ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
                    {agent.display_name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {allTags.length > 0 ? (
            <div className="flex max-w-4xl flex-wrap items-center justify-center gap-1.5">
              {allTags.slice(0, tagsExpanded ? undefined : 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`inline-flex h-7 items-center rounded-[7px] px-2.5 text-xs font-medium transition-colors ${
                    selectedTag === tag
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}

              {allTags.length > 8 ? (
                <button
                  type="button"
                  onClick={() => setTagsExpanded((prev) => !prev)}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {tagsExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />+{allTags.length - 8}
                    </>
                  )}
                </button>
              ) : null}

              {selectedTag ? (
                <button
                  type="button"
                  onClick={() => setSelectedTag(null)}
                  className="ml-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  清除筛选
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="mb-4 h-12 w-12" />
          <p>{t("projects.noProjects")}</p>
          <p className="text-sm">{t("projects.noProjectsDesc")}</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Search className="mb-2 h-8 w-8" />
          <p className="text-sm">{t("projects.noSearchResults")}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.encoded_name}
              project={project}
              selected={selectedProject?.encoded_name === project.encoded_name}
              onClick={() => setSelectedProject(project)}
              meta={projectMetas?.[project.encoded_name]}
              managementMode={managementMode}
              checked={checkedProjects.has(project.encoded_name)}
              onCheck={() => handleCheck(project.encoded_name)}
              mergedCount={getMergedCount(project.encoded_name)}
              onTagClick={(tag) => setSelectedTag(selectedTag === tag ? null : tag)}
              onRefresh={() => {
                refetch();
                refetchMerges();
              }}
              onEnterChat={() => onEnterProject?.(project)}
              agentNames={Object.fromEntries(agents.map((agent) => [agent.id, agent.display_name]))}
            />
          ))}
        </div>
      )}

      {selectedProject ? (
        <ProjectDetail
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onViewSessions={() => undefined}
          onRemoved={() => {
            setSelectedProject(null);
            refetch();
          }}
          projectMetas={projectMetas ?? undefined}
          onUpdateMetas={refetchMetas}
          merges={merges ?? undefined}
          onSplit={handleMergeComplete}
          agentNames={Object.fromEntries(agents.map((agent) => [agent.id, agent.display_name]))}
        />
      ) : null}

      <AddProjectDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdded={handleProjectAdded} />

      {managementMode && checkedProjects.size >= 2 ? (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t bg-background p-3">
          <span className="text-sm">已选择 {checkedProjects.size} 个项目</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCheckedProjects(new Set())}>
              取消选择
            </Button>
            <Button onClick={() => setMergeDialogOpen(true)}>合并项目</Button>
          </div>
        </div>
      ) : null}

      {mergeDialogOpen && checkedProjects.size >= 2 ? (
        <MergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          selectedProjects={[...checkedProjects]}
          projectNames={Object.fromEntries(projects?.map((project) => [project.encoded_name, project.name]) ?? [])}
          onMergeComplete={handleMergeComplete}
        />
      ) : null}
    </div>
  );
}
