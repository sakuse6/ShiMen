export interface LmentorCommandSpec<TResult = unknown> {
  id: string;
  route: string;
  __result?: TResult;
  domain:
    | "app"
    | "chat"
    | "config"
    | "environment"
    | "overview"
    | "projects"
    | "providers"
    | "sessions"
    | "tools"
    | "enhancements"
    | "agents";
}

function command<TResult>(
  id: string,
  route: string,
  domain: LmentorCommandSpec["domain"],
): LmentorCommandSpec<TResult> {
  return { id, route, domain };
}

export const lmentorCommands = {
  app: {
    loadAlwaysOnTop: command<boolean>("app.loadAlwaysOnTop", "load_always_on_top", "app"),
    toggleAlwaysOnTop: command<boolean>("app.toggleAlwaysOnTop", "toggle_always_on_top", "app"),
    checkForUpdate: command<{ latest_version: string | null; has_update: boolean; release_url: string; error: string | null }>(
      "app.checkForUpdate",
      "check_for_update",
      "app",
    ),
    downloadUpdate: command<{ version: string | null; installer_path: string | null }>(
      "app.downloadUpdate",
      "download_update",
      "app",
    ),
    installUpdate: command<void>("app.installUpdate", "install_update", "app"),
    openUrl: command<void>("app.openUrl", "open_url", "app"),
    loadQuoteCarouselItems: command<{ items: string[]; source_path: string; range: string; updated_at: string | null; error: string | null }>(
      "app.loadQuoteCarouselItems",
      "load_quote_carousel_items",
      "app",
    ),
    loadTheme: command<string>("app.loadTheme", "load_theme", "app"),
    saveTheme: command<void>("app.saveTheme", "save_theme", "app"),
    loadFontSizes: command<[string | null, string | null]>("app.loadFontSizes", "load_font_sizes", "app"),
    saveFontSizes: command<void>("app.saveFontSizes", "save_font_sizes", "app"),
    saveLanguage: command<void>("app.saveLanguage", "save_language", "app"),
  },
  projects: {
    list: command("projects.list", "scan_projects", "projects"),
    metas: command("projects.metas", "load_project_metas", "projects"),
    merges: command("projects.merges", "get_project_merges", "projects"),
    lastProject: command<string | null>("projects.lastProject", "load_last_project", "projects"),
    saveLastProject: command<void>("projects.saveLastProject", "save_last_project", "projects"),
    add: command("projects.add", "add_project", "projects"),
    remove: command<void>("projects.remove", "remove_project", "projects"),
    init: command<void>("projects.init", "init_project", "projects"),
    openTerminal: command<number>("projects.openTerminal", "open_in_terminal", "projects"),
    claudeMd: command<string | null>("projects.claudeMd", "load_claude_md", "projects"),
    saveMeta: command<void>("projects.saveMeta", "save_project_meta", "projects"),
    mergeLogical: command<void>("projects.mergeLogical", "merge_projects_logical", "projects"),
    split: command<void>("projects.split", "split_project", "projects"),
    settingsShared: command("projects.settingsShared", "load_project_settings", "projects"),
    settingsLocal: command("projects.settingsLocal", "load_project_settings_local", "projects"),
    directory: command("projects.directory", "list_project_directory", "projects"),
    saveSettingsShared: command<void>("projects.saveSettingsShared", "save_project_settings", "projects"),
    saveSettingsLocal: command<void>("projects.saveSettingsLocal", "save_project_settings_local", "projects"),
  },
  sessions: {
    names: command<Record<string, string>>("sessions.names", "get_session_names", "sessions"),
    list: command("sessions.list", "list_sessions", "sessions"),
    listAll: command("sessions.listAll", "list_all_sessions", "sessions"),
    manager: command("sessions.manager", "load_session_manager", "sessions"),
    messages: command("sessions.messages", "get_session_messages", "sessions"),
    activityTrace: command("sessions.activityTrace", "get_session_activity_trace", "sessions"),
    rename: command<void>("sessions.rename", "rename_session", "sessions"),
    clearName: command<void>("sessions.clearName", "delete_session_name", "sessions"),
    deleteRecord: command("sessions.deleteRecord", "delete_session_record", "sessions"),
    exportMarkdown: command("sessions.exportMarkdown", "export_session_markdown", "sessions"),
    findTerminal: command("sessions.findTerminal", "find_session_terminal", "sessions"),
    focusTerminal: command<boolean>("sessions.focusTerminal", "focus_session_terminal", "sessions"),
    registerTerminal: command<void>("sessions.registerTerminal", "register_terminal_session", "sessions"),
    saveFiles: command("sessions.saveFiles", "save_session_files", "sessions"),
    sendMessage: command("sessions.sendMessage", "send_message", "chat"),
    abort: command<void>("sessions.abort", "abort_chat", "chat"),
  },
  config: {
    load: command("config.load", "load_config", "config"),
    loadRaw: command("config.loadRaw", "load_raw_config", "config"),
    save: command<void>("config.save", "save_config", "config"),
    saveRaw: command<void>("config.saveRaw", "save_raw_config", "config"),
    exportStructured: command<void>("config.exportStructured", "export_config_dialog", "config"),
    exportRaw: command<void>("config.exportRaw", "export_raw_config_dialog", "config"),
    importStructured: command<void>("config.importStructured", "import_config_dialog", "config"),
    templates: command("config.templates", "list_config_templates", "config"),
    presets: command("config.presets", "list_presets", "config"),
    savePreset: command<void>("config.savePreset", "save_preset", "config"),
    applyPreset: command<void>("config.applyPreset", "apply_preset", "config"),
    deletePreset: command<void>("config.deletePreset", "delete_preset", "config"),
    backups: command("config.backups", "list_backups", "config"),
    restoreBackup: command<void>("config.restoreBackup", "restore_backup", "config"),
  },
  environment: {
    check: command("environment.check", "check_environment", "environment"),
    checkUpdates: command("environment.checkUpdates", "check_available_updates", "environment"),
    installCommand: command<void>("environment.installCommand", "install_agent_command", "environment"),
  },
  agents: {
    list: command("agents.list", "agent_list_statuses", "agents"),
    active: command<string>("agents.active", "agent_get_active", "agents"),
    refreshHealth: command<void>("agents.refreshHealth", "agent_refresh_health", "agents"),
    restartActive: command("agents.restartActive", "agent_restart_active", "agents"),
    restartCodex: command("agents.restartCodex", "agent_restart_codex", "agents"),
    setActive: command<void>("agents.setActive", "agent_set_active", "agents"),
    presets: command("agents.presets", "agent_command_presets", "agents"),
    checkPrerequisite: command<boolean>("agents.checkPrerequisite", "check_prerequisite", "agents"),
    rosterModule: command("agents.rosterModule", "load_agent_roster_module", "agents"),
    saveRosterAgent: command("agents.saveRosterAgent", "save_agent_roster_profile", "agents"),
    saveRosterLineage: command("agents.saveRosterLineage", "save_agent_roster_lineage", "agents"),
    saveRosterIdentity: command("agents.saveRosterIdentity", "save_agent_roster_identity", "agents"),
    deleteRosterAgent: command("agents.deleteRosterAgent", "delete_agent_roster_profile", "agents"),
    setRosterActive: command<void>("agents.setRosterActive", "set_active_agent_roster_profile", "agents"),
    saveMemoryEntry: command("agents.saveMemoryEntry", "save_agent_memory_entry", "agents"),
    deleteMemoryEntry: command<void>("agents.deleteMemoryEntry", "delete_agent_memory_entry", "agents"),
    toggleMemoryVisibility: command("agents.toggleMemoryVisibility", "toggle_agent_memory_visibility", "agents"),
    toggleMemoryShared: command("agents.toggleMemoryShared", "toggle_agent_memory_shared", "agents"),
    toggleMemoryEnabled: command("agents.toggleMemoryEnabled", "toggle_agent_memory_enabled", "agents"),
  },
  tools: {
    customCommands: command("tools.customCommands", "list_custom_commands", "tools"),
    saveCustomCommand: command<void>("tools.saveCustomCommand", "save_custom_command", "tools"),
    deleteCustomCommand: command<void>("tools.deleteCustomCommand", "delete_custom_command", "tools"),
    runTerminalCommand: command<void>("tools.runTerminalCommand", "run_in_terminal", "tools"),
    listToolsPlugins: command("tools.listToolsPlugins", "list_tools_and_plugins", "tools"),
    module: command("tools.module", "load_tools_plugins_module", "tools"),
    skillLibrary: command("tools.skillLibrary", "list_skill_library", "tools"),
    validateSkillImport: command("tools.validateSkillImport", "validate_skill_import", "tools"),
    installSkillFromFile: command("tools.installSkillFromFile", "install_skill_from_file", "tools"),
    codexRuntimeImportSources: command("tools.codexRuntimeImportSources", "codex_runtime_import_sources", "tools"),
    codexRuntimeImportPreview: command("tools.codexRuntimeImportPreview", "codex_runtime_import_preview", "tools"),
    codexRuntimeImportExecute: command("tools.codexRuntimeImportExecute", "codex_runtime_import_execute", "tools"),
    saveContextEntry: command("tools.saveContextEntry", "save_context_entry_record", "tools"),
    deleteContextEntry: command<void>("tools.deleteContextEntry", "delete_context_entry_record", "tools"),
    toggleContextEntry: command<void>("tools.toggleContextEntry", "toggle_context_entry_record", "tools"),
  },
  enhancements: {
    list: command("enhancements.list", "list_enhancements", "enhancements"),
    module: command("enhancements.module", "load_enhancements_module", "enhancements"),
    saveSettings: command("enhancements.saveSettings", "save_enhancements_settings", "enhancements"),
  },
  providers: {
    list: command("providers.list", "list_providers", "providers"),
    module: command("providers.module", "load_provider_module", "providers"),
    saveProfile: command("providers.saveProfile", "save_provider_profile", "providers"),
    deleteProfile: command<void>("providers.deleteProfile", "delete_provider_profile", "providers"),
    activateProfile: command("providers.activateProfile", "activate_provider_profile", "providers"),
    fetchModels: command("providers.fetchModels", "fetch_provider_models", "providers"),
    setProfileModel: command("providers.setProfileModel", "set_provider_profile_model", "providers"),
    syncSessions: command("providers.syncSessions", "sync_provider_sessions", "providers"),
  },
  overview: {
    load: command("overview.load", "load_overview", "overview"),
    module: command("overview.module", "load_overview_module", "overview"),
  },
  files: {
    readText: command("files.readText", "read_text_file", "app"),
    readBase64: command<string>("files.readBase64", "read_file_as_base64", "app"),
    readDataUrl: command<string>("files.readDataUrl", "read_file_as_data_url", "app"),
    readImage: command<string>("files.readImage", "read_image_as_data_url", "app"),
    openSystem: command<void>("files.openSystem", "open_file_with_system", "app"),
    clipboardPaths: command<string[]>("files.clipboardPaths", "get_clipboard_file_paths", "app"),
  },
} as const;

type CommandGroup = typeof lmentorCommands;
type CommandGroupKey = keyof CommandGroup;

function collectRoutes(groups: CommandGroup): Map<string, string> {
  const entries = new Map<string, string>();

  for (const groupKey of Object.keys(groups) as CommandGroupKey[]) {
    const group = groups[groupKey];
    for (const spec of Object.values(group)) {
      entries.set(spec.route, spec.route);
    }
  }

  return entries;
}

const allowedRoutes = collectRoutes(lmentorCommands);

export function resolveLmentorRoute(commandOrSpec: string | LmentorCommandSpec<any>): string {
  const route = typeof commandOrSpec === "string" ? commandOrSpec : commandOrSpec.route;

  if (!route || !route.trim()) {
    return "";
  }

  if (!allowedRoutes.has(route)) {
    throw new Error(`Lmentor 阶段 0 拒绝了未注册的接口路由：${route}`);
  }

  return route;
}
