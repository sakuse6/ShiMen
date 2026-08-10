const SKILL_DISPLAY_NAMES: Record<string, string> = {
  "academic-research-suite": "学术研究套件",
  "browser": "浏览器控制",
  "browser:control-in-app-browser": "浏览器控制",
  "control-in-app-browser": "浏览器控制",
  "deep-research": "深度研究",
  "documents": "文档处理",
  "find-skills": "技能发现",
  "imagegen": "图像生成",
  "openai-docs": "OpenAI 文档",
  "ophanim": "座天使-聊天思维导图",
  "pdf": "PDF 处理",
  "plugin-creator": "插件创建器",
  "presentations": "演示文稿",
  "self-improving-agent": "自改进代理",
  "skill-creator": "技能创建器",
  "skill-installer": "技能安装器",
  "spreadsheets": "表格处理",
  "template-creator": "模板创建器",
  "web-access": "联网访问",
};

const SKILL_PURPOSE_TEXT: Record<string, string> = {
  "academic-research-suite": "用于学术研究、文献综述、论文写作、稿件审查、研究流程规划和实验方案评估。",
  "browser": "用于控制应用内浏览器，打开页面、点击、输入、截图并验证网页行为。",
  "browser:control-in-app-browser": "用于控制应用内浏览器，打开页面、点击、输入、截图并验证网页行为。",
  "control-in-app-browser": "用于控制应用内浏览器，打开页面、点击、输入、截图并验证网页行为。",
  "deep-research": "用于执行深入研究、证据检索、事实核查、文献综述和研究问题收敛。",
  "documents": "用于创建、修改、批注文档，并在导出前进行版面渲染检查。",
  "find-skills": "用于发现、筛选和安装适合当前任务的能力扩展。",
  "imagegen": "用于生成或编辑位图图像，例如插画、照片风格图、纹理、图标草稿和透明背景素材。",
  "openai-docs": "用于查询官方接口、模型、产品和开发流程文档，辅助选择合适能力并更新提示。",
  "ophanim": "用于把指定范围内的对话整理成稳定的思维导图，重建流程、决策、分支和循环关系。",
  "pdf": "用于读取、创建、检查和渲染便携文档文件，并验证版面和抽取结果。",
  "plugin-creator": "用于创建和维护本地插件目录、清单文件和市场入口。",
  "presentations": "用于创建或编辑演示文稿，组织页面结构、内容和视觉排版。",
  "self-improving-agent": "用于记录技能使用经验并沉淀改进建议，帮助代理在后续任务中持续优化。",
  "skill-creator": "用于规划和编写新的技能说明，帮助把专业流程沉淀成可复用能力。",
  "skill-installer": "用于从可用列表或代码仓库安装技能到当前技能目录。",
  "spreadsheets": "用于创建、修改、分析表格文件，处理公式、格式、图表和数据校验。",
  "template-creator": "用于把常用文档、演示稿或表格样式沉淀成可复用模板。",
  "web-access": "用于规范联网检索、网页访问、登录后操作和动态页面读取流程。",
};

function cleanSkillName(value: string): string {
  return value
    .trim()
    .replace(/^Skill:\s*/i, "")
    .replace(/\.imported-\d{8}-\d{6}$/i, "")
    .replace(/^[`'"]+|[`'"]+$/g, "");
}

function lookupDisplayName(skillId: string): string | null {
  const normalized = cleanSkillName(skillId).toLowerCase();
  if (SKILL_DISPLAY_NAMES[normalized]) return SKILL_DISPLAY_NAMES[normalized];

  const parts = normalized.split(":");
  const suffix = normalized.includes(":") ? parts[parts.length - 1] || normalized : normalized;
  return SKILL_DISPLAY_NAMES[suffix] ?? null;
}

export function formatSkillDisplayName(nameOrTitle: string, rawName?: string): string {
  const raw = cleanSkillName(rawName || nameOrTitle);
  const title = cleanSkillName(nameOrTitle);
  const mapped = lookupDisplayName(raw) || lookupDisplayName(title);

  if (mapped) return `${raw}-${mapped}`;
  if (rawName && title && title !== raw) return `${raw}-${title}`;
  return raw;
}

function lookupPurpose(skillId: string): string | null {
  const normalized = cleanSkillName(skillId).toLowerCase();
  if (SKILL_PURPOSE_TEXT[normalized]) return SKILL_PURPOSE_TEXT[normalized];

  const parts = normalized.split(":");
  const suffix = normalized.includes(":") ? parts[parts.length - 1] || normalized : normalized;
  return SKILL_PURPOSE_TEXT[suffix] ?? null;
}

export function formatSkillPurposeText(skill: { name: string; title?: string; description?: string }): string {
  const mapped = lookupPurpose(skill.name) || lookupPurpose(skill.title || "");
  const description = String(skill.description || "").trim();
  if (description) return description;
  return mapped || "未提供能力说明。";
}
