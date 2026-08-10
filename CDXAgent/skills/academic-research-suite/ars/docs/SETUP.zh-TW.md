# ARS 安装设定

Academic Research Skills 的前置需求与选用设定。只需要 Markdown 输出与预设 Claude Opus 4.8 pipeline 的人，大部分内容可以略过。请见下方「最小可行设定」。

---

## 最小可行设定

1. 安装 扩展智能体运行环境（见下方）。
2. 设定 `ANTHROPIC_API_KEY`。
3. 在这个 repo（或任何把 ARS 放在 `.claude/skills/` 下的专案）执行 `claude`。

这样就够了。可得到 Markdown 输出与 DOCX 转换说明。以下其他内容都是选用。

---

## 安装 扩展智能体运行环境

**建议：原生安装程式**（不需要 Node.js，自动更新）：

```bash
# macOS / Linux
curl -fsSL https://claude.ai/install.sh | bash

# Windows (PowerShell)
irm https://claude.ai/install.ps1 | iex
```

<details>
<summary>替代方案：npm 安装（已弃用）</summary>

需要 Node.js 18+。

```bash
npm install -g @anthropic-ai/claude-code
```

</details>

## 设定 API Key

你需要一个 Anthropic API key，请至 <https://console.anthropic.com/> 取得。

```bash
# 扩展智能体运行环境 will prompt for your API key on first run
claude
```

或设定环境变数：

```bash
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

## DOCX 输出（选用）

若要直接产出 `.docx`，需要安装 [Pandoc](https://pandoc.org/)。若系统没有 Pandoc，formatter 会回退为提供 Markdown 与 DOCX 转换说明。

```bash
# macOS
brew install pandoc

# Linux (Debian/Ubuntu)
sudo apt-get install pandoc

# Windows — download from https://pandoc.org/installing.html
```

## LaTeX / PDF 输出（选用）

PDF 输出需要 [tectonic](https://tectonic-typesetting.github.io/) 和特定字型。**这是选用的**。Markdown 输出与 DOCX 转换说明不需要这些。

```bash
# macOS
brew install tectonic

# Linux (Debian/Ubuntu)
curl --proto '=https' --tlsv1.2 -fsSL https://drop-sh.fullyjustified.net | sh

# Windows — download from https://tectonic-typesetting.github.io/en-US/install.html
```

**所需字型**（APA 7.0 中文输出）：

- **Times New Roman**：macOS/Windows 通常已内建；Linux 安装 `ttf-mscorefonts-installer`
- **Source Han Serif TC VF**（思源宋体）：从 [Google Fonts](https://fonts.google.com/specimen/Noto+Serif+TC) 或 [Adobe GitHub](https://github.com/adobe-fonts/source-han-serif) 下载
- **Courier New**：通常已内建

> 如果只需要 Markdown 输出或 DOCX 转换说明，可完全跳过此步骤。直接产出 `.docx` 需要 Pandoc，PDF 需要 `tectonic`。

---

## Material Passport `literature_corpus[]` adapters（v3.6.4+，选用）

如果你已经维护一个策展过的文献语料（Zotero、Obsidian、PDF 资料夹等），可以先把它打包进 Material Passport，让 Phase 1 ARS agent 在去外部资料库搜寻之前先读你的文献库。此功能采 opt-in 与 presence-based 设计。没提供语料时，ARS 走 external-DB-only flow，行为不变。

v3.6.4 附三个 reference Python adapter，位于 `scripts/adapters/`：

```bash
# 1. Install adapter dependencies (PyYAML + jsonschema, already in requirements-dev.txt)
pip install -r requirements-dev.txt

# 2. Run a reference adapter (pick one that matches your corpus source).
#    Both --passport and --rejection-log are required.
python scripts/adapters/folder_scan.py --input /path/to/pdfs               --passport passport.yaml --rejection-log rejection_log.yaml
python scripts/adapters/zotero.py      --input my-zotero-export.json       --passport passport.yaml --rejection-log rejection_log.yaml
python scripts/adapters/obsidian.py    --input ~/Obsidian/Lit\ Notes       --passport passport.yaml --rejection-log rejection_log.yaml

# 3. Pass the resulting passport.yaml into your ARS session
#    (concrete invocation depends on which skill you're running — see scripts/adapters/README.md)
```

每个 adapter 产两个档案：`passport.yaml`（Schema 9，已填 `literature_corpus[]`）与 `rejection_log.yaml`（永远输出，无 rejection 时为空，采 categorical reason 封闭 enum）。Reference 之外的语料来源预期由使用者自行撰写 adapter，遵循 [`academic-pipeline/references/adapters/overview.md`](../academic-pipeline/references/adapters/overview.md)。

v3.6.5 接上 `bibliography_agent`（deep-research, Phase 1）与 `literature_strategist_agent`（academic-paper, Phase 1）作为 consumer。两者在 passport 带非空 corpus 且解析成功时走 corpus-first / search-fills-gap flow。完整 consumer 协定见 [`academic-pipeline/references/literature_corpus_consumers.md`](../academic-pipeline/references/literature_corpus_consumers.md)。

## 选用环境变数（v3.5.1+）

ARS 暴露若干 opt-in flag，全部预设 OFF；设定后仅影响当前 session。

| Flag | 起始版本 | 作用 | 参考 |
|---|---|---|---|
| `ARS_CROSS_MODEL` | v3.0 | 启用跨模型验证（见下节） | [§「跨模型验证」](#跨模型验证选用) |
| `ARS_SOCRATIC_READING_PROBE=1` | v3.5.1 | 启用 `socratic_mentor_agent` 的读书检查 probe layer。仅 goal-oriented intent；使用者引用过具体论文时最多触发一次；婉拒不留纪录惩罚。 | `deep-research/agents/socratic_mentor_agent.md` |
| `ARS_PASSPORT_RESET=1` | v3.6.3 | 把每个 FULL checkpoint 提升为 context 重置边界。**emit** boundary entry 必须设此 flag；新 session 用 `resume_from_passport=<hash>` 续跑**不需要** flag。`systematic-review` 模式下 flag ON 时，每个 FULL checkpoint 一律强制重置。 | `academic-pipeline/references/passport_as_reset_boundary.md` |
| `ARS_CROSS_MODEL_SAMPLE_INTERVAL` | v3.5.0 | 跨模型完整性抽查的取样间隔（advisory） | `shared/cross_model_verification.md` |
| `ARS_VERIFICATION_CACHE_PATH` | v3.11 | 覆写引用查验 cache 的位置（见下节）。不是 on/off flag——cache 预设开启，此变数只改位置。 | `scripts/verification_cache.py` |

---

## 引用查验 cache（v3.11，#182）

确定性引用存在性 gate（#182）会对每笔引用比对 Semantic Scholar、OpenAlex、Crossref、arXiv。为避免跨草稿重复查同一篇论文，结果存进本机 SQLite。

- **无需设定。** Cache 首次使用时自动建在 `~/.cache/ars/verification.db`，条目 90 天后过期。arXiv resolver 不需 API key。
- **改位置**：汇出 `ARS_VERIFICATION_CACHE_PATH=/your/path.db`（例如跨专案共用一份 cache，或放在较快的磁碟）。
- **作废单笔引用**：`/ars-cache-invalidate <citation_key>`——移除该 key 的所有 cache 列（四个 resolver、所有 query form）；若无 cache 则为幂等 no-op。

Cache 为单一 process（SQLite WAL）；多使用者共用同一 cache 档案不在范围内。

---

## 跨模型验证（选用）

ARS 使用 Claude Opus 4.8 即可完整运作。想要更高信心，可选择启用第二 AI 模型来独立验证完整性检查，并挑战魔鬼代言人。

### 快速设定

```bash
# Step 1: Set your API key (choose one or both)
export OPENAI_API_KEY="sk-your-key-here"        # For GPT-5.4 Pro
export GOOGLE_AI_API_KEY="AIza-your-key-here"    # For Gemini 3.1 Pro

# Step 2: Choose your cross-verification model
export ARS_CROSS_MODEL="gpt-5.4-pro"            # Best reasoning
# or: export ARS_CROSS_MODEL="gemini-3.1-pro-preview"  # Strong at factual verification

# Step 3: Run 扩展智能体运行环境 as normal — cross-verification activates automatically
claude
```

### 启用后的差异

| 功能 | 未启用跨模型 | 启用跨模型 |
|---|---|---|
| 完整性验证 | 单模型 100% 检查 | + 30% 样本由第二模型独立验证 |
| 魔鬼代言人 | 单模型 DA | + 跨模型产生独立 critique，新发现自动加入 |
| 同侪审查 | 5 位审稿人（同模型） | 同样 5 位审稿人 + 跨模型 DA critique / calibration 支援 |

### 费用

完整 pipeline 会增加约 $0.60-1.10 的跨模型 API 费用（GPT-5.4 Pro 定价）。详细拆解见 [`shared/cross_model_verification.md`](../shared/cross_model_verification.md)。

### 没有 API key？没问题

没有设定 `ARS_CROSS_MODEL` 时，一切照旧运作。跨模型功能不会出现，也不会增加任何额外开销。

---

## 安装方式

Claude 会在 `<install-root>/<skill-name>/SKILL.md` 寻找 skills。这个 repo 包含四个独立 skills，每个都有自己的 `SKILL.md`：

- `deep-research`
- `academic-paper`
- `academic-paper-reviewer`
- `academic-pipeline`

不要把整个 repository 当成单一巢状 skill 资料夹安装到 `.claude/skills/academic-research-skills/`。那会让四个 `SKILL.md` 比 Claude 可发现的位置多埋一层。请参考 Anthropic 的 [扩展智能体运行环境 Skills documentation](https://code.claude.com/docs/en/skills)。

### 方法零：扩展智能体运行环境 Plugin（v3.7.0+，扩展智能体运行环境 CLI / IDE 用户推荐）

如果你用的是 扩展智能体运行环境 CLI、VS Code extension 或 JetBrains extension，可以一行指令安装 ARS：

```text
/plugin marketplace add Imbad0202/academic-research-skills
/plugin install academic-research-skills
```

四个 skill（`deep-research`、`academic-paper`、`academic-paper-reviewer`、`academic-pipeline`）会从 plugin 的 `skills/` 目录自动载入。

**强烈建议开启 auto-update。** 进 `/plugin` UI 找到 `academic-research-skills`，把 auto-update 开起来。ARS 大约 1–2 周发新版，开了之后会自动同步。手动更新已安装的 plugin：`/plugin update academic-research-skills`。（`/plugin marketplace update academic-research-skills` 只重新拉 marketplace 来源，不会更新已装 plugin。）

**Plugin 平台支援范围：**
- ✅ 扩展智能体运行环境 CLI / VS Code extension / JetBrains extension — 完整支援
- ❌ claude.ai 网页版 / Claude for Work / Anthropic API 直呼 — 不支援 plugin，请改用方法一 / 二 / 三
- ➡️ 隔离智能体运行环境 — 改装姊妹版 [`Imbad0202/academic-research-skills-codex`](https://github.com/Imbad0202/academic-research-skills-codex)（同一套 workflow 内容、Codex 原生包装）

### 方法一：作为专案 Skills（推荐）

当你希望 ARS 可在既有 扩展智能体运行环境 专案内使用时，请用此方式。

先将 repo clone 到稳定的本机路径，再把每个 skill 资料夹复制到专案的 `.claude/skills/` 目录：

```bash
git clone https://github.com/Imbad0202/academic-research-skills.git ~/academic-research-skills

cd /path/to/your/project
mkdir -p .claude/skills
cp -R ~/academic-research-skills/deep-research .claude/skills/deep-research
cp -R ~/academic-research-skills/academic-paper .claude/skills/academic-paper
cp -R ~/academic-research-skills/academic-paper-reviewer .claude/skills/academic-paper-reviewer
cp -R ~/academic-research-skills/academic-pipeline .claude/skills/academic-pipeline
```

预期路径形状：

```text
/path/to/your/project/.claude/skills/deep-research/SKILL.md
/path/to/your/project/.claude/skills/academic-paper/SKILL.md
/path/to/your/project/.claude/skills/academic-paper-reviewer/SKILL.md
/path/to/your/project/.claude/skills/academic-pipeline/SKILL.md
```

接著将 `.claude/CLAUDE.md` 的内容复制到你专案的 `.claude/CLAUDE.md`（若已有则合并）。

> **全域 扩展智能体运行环境 安装：** 若希望所有 扩展智能体运行环境 专案都能使用这些 skills，请改安装四个资料夹到 `~/.claude/skills/`：
>
> ```bash
> git clone https://github.com/Imbad0202/academic-research-skills.git ~/academic-research-skills
>
> mkdir -p ~/.claude/skills
> cp -R ~/academic-research-skills/deep-research ~/.claude/skills/deep-research
> cp -R ~/academic-research-skills/academic-paper ~/.claude/skills/academic-paper
> cp -R ~/academic-research-skills/academic-paper-reviewer ~/.claude/skills/academic-paper-reviewer
> cp -R ~/academic-research-skills/academic-pipeline ~/.claude/skills/academic-pipeline
> ```

### 方法二：作为独立专案

当你想直接在 ARS repository 内工作时，请用此方式。

```bash
git clone https://github.com/Imbad0202/academic-research-skills.git
cd academic-research-skills
claude
```

<details>
<summary><strong>没有安装 Git？</strong>改下载 ZIP</summary>

1. 前往 <https://github.com/Imbad0202/academic-research-skills>
2. 点击绿色 **Code** 按钮 → **Download ZIP**
3. 解压缩 ZIP 到你想要的位置
4. 方法一：将解压后的四个 skill 资料夹（`deep-research`、`academic-paper`、`academic-paper-reviewer`、`academic-pipeline`）复制到你专案内的 `.claude/skills/`
5. 独立使用：在解压后的资料夹中开启终端机，执行 `claude`

</details>

### 方法三：Claude Cowork（桌面版）

当你想在 [Claude Cowork](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork) 使用四个 ARS skills 时，请用此方式。Cowork 是 Claude Desktop 的 agentic workspace。

> **Cowork 不会读取 `~/.claude/skills/`。** 该目录属于 扩展智能体运行环境（CLI / IDE），Cowork 不会扫描它。Cowork 读取的是你透过 **Settings → Capabilities → Skills** 上传的 skill，每个 skill 各自打包成一个 zip。把 skill 资料夹 symlink 或复制到 `~/.claude/skills/`，无论重启几次都不会让它们出现在 Cowork。

#### 前置需求

- macOS 或 Windows 的最新版 Claude Desktop。请从 Anthropic 的 [Claude Desktop page](https://claude.ai/download) 下载。
- 可用的网路连线；Cowork tasks 会呼叫 Anthropic API。
- Cowork tasks 执行时，请保持 Claude Desktop 开启。Cowork 在 Desktop process 内执行。
- 具备 Cowork 存取权的付费方案。目前方案可用性请参考 Anthropic 的 [Cowork requirements](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork)。
- **必须在 Settings → Capabilities 启用 code execution / file creation**，否则 Skills 区段不会出现。参见 Anthropic 的 [Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)。
- Team 或 Enterprise 方案中，组织管理员可能停用了 Skills。若启用 code execution 后 Skills 区段仍未出现，请管理员检查组织层级设定。

#### 步骤 1：每个 skill 各打一个 zip

clone repo 后，把四个 skill 资料夹各自打包成 zip，让每个 zip 的顶层都是它自己的 `SKILL.md`（不要多包一层资料夹）。`-x "*.DS_Store"` 用来排除 macOS metadata。

```bash
git clone https://github.com/Imbad0202/academic-research-skills.git
cd academic-research-skills

for s in deep-research academic-paper academic-paper-reviewer academic-pipeline; do
  (cd "$s" && zip -r "../$s.zip" . -x "*.DS_Store")
done
```

这会在 repo 根目录产生四个 zip：`deep-research.zip`、`academic-paper.zip`、`academic-paper-reviewer.zip`、`academic-pipeline.zip`。每个 zip 的顶层结构如下：

```text
SKILL.md
agents/
examples/
references/
templates/
```

#### 步骤 2：逐一上传每个 zip

1. 在 Claude Desktop（或 claude.ai，上传的 skill 会同步到同一个帐号）中，前往 **Settings → Capabilities → Skills**。
2. 用 Skills 面板的 **+** 上传 skill，选择其中一个 zip。四个 zip 各上传一次，一次一个。
3. 每个 skill 上传后会出现在 **Personal skills** 下，已自动启用，**Trigger 为 Slash command + auto**。以相同名称重新上传会覆盖既有的 skill（更新到新版 ARS 时很方便）。

已在 Claude Desktop 验证（2026 年 6 月）：用此方式打包的 `deep-research.zip` 可干净安装，完整 skill description 保留（不会被截到 200 字元），且 `/deep-research` 会出现在 Cowork command palette。

#### 步骤 3：在 Cowork Task 中使用

在 Cowork Task 中输入 `/` 开启 command palette 选取 skill，或直接用白话描述意图（例如「帮我对 X 做深度文献回顾」），Cowork 会依 skill 的 `description` 自动路由。

#### 与 扩展智能体运行环境 的一个取舍

用此方式上传的每个 skill 各自独立运作，是一份 standalone 的指令集，体验与 扩展智能体运行环境 不同。在 扩展智能体运行环境 中，四个 skill 是协作团队：`academic-pipeline` 会把它们串起来（research → write → review → revise），每个 skill 各自驱动自己那组 sub-agent。Cowork 的 uploaded-skill runtime 不提供这种 sub-agent orchestration，所以个别 skill 会回应，但完整的 end-to-end pipeline 不会像在 扩展智能体运行环境 那样运作。想要完整的协作体验，请用上方的方法零（plugin）或方法一（project skills）在 扩展智能体运行环境 安装 ARS。

### 方法四：使用 claude.ai（网页版）

ARS 是为 扩展智能体运行环境 设计的 skill suite。四个 skill 各自是 12-13 个 agent 组成的工作团队，仰赖多 agent 协作、`scripts/` 下可执行的转接器，以及 Material Passport 的档案交接。claude.ai 网页版的执行环境跟 扩展智能体运行环境 不同，要把这个 repository 接进 claude.ai 有两条路径，差别很大：

- **方法 4b — Project + GitHub integration**（推荐给 claude.ai 使用者）：把 repository 接进 claude.ai Project 当成可检索的知识库。Claude 可以读取 skill 主体、references、schemas 与范例输出，并依此回答问题或起草。不是 Skill 安装 — 不会自动载入、不会做 skill routing，但内容可完整读取与引用。
- **方法 4a — Custom Skill upload**：claude.ai 标准的 Skill 安装路径（Settings → Capabilities → Skills，每个 skill 各一个 zip）。**不推荐给本 suite 使用** — 使用前请先看下方原因。

#### 前置需求

- claude.ai 帐号。可用方案因 sub-method 不同（见下）。
- **方法 4b**：claude.ai Projects 各方案皆可使用，详见 Anthropic 的 [What are Projects?](https://support.claude.com/en/articles/9517075-what-are-projects)；付费方案（Pro、Max、Team、Enterprise）有更大的知识库容量与更强的检索能力。需要透过 Anthropic connector 进行 GitHub 验证 — 请参考 [Using the GitHub integration](https://support.claude.com/en/articles/10167454-using-the-github-integration) 与 [Set up Claude integrations](https://support.claude.com/en/articles/10168395-set-up-claude-integrations)。Private repositories 需要在 repo 或 organization 上授权 Anthropic GitHub App。Team 与 Enterprise 方案则需要 owner 层级先启用 connector，使用者才能加入 GitHub 来源的档案。
- **方法 4a**：Custom Skills 在 Free、Pro、Max、Team、Enterprise 方案皆可使用，详见 Anthropic 的 [Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)。同篇文件也说明 Skills 需要在 Settings → Capabilities 启用 **code execution**。方法 4a 不需要 GitHub 验证 — 你要在本机将每个 skill 资料夹各自压成 zip，再透过 Settings → Capabilities → Skills 逐一上传。Zip 结构错误与 200 字元 `description` 上限会在上传时显示错误；请参考 Anthropic 的 [Custom Skills packaging documentation](https://claude.com/docs/skills/how-to) 与 [How to create custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills)。

#### 方法 4b：Project + GitHub integration（推荐给 claude.ai）

claude.ai Projects 会把内容当成静态知识提供给 Claude 检索与引用。请参考 Anthropic 的 [What are Projects?](https://support.claude.com/en/articles/9517075-what-are-projects)。这不是 Skill 安装。Skill 不会自动载入，trigger phrases 不会路由。Claude 可以读取 repo 内容、针对它回答问题或进行引用，但不会把 skills 当成 agentic workflows 执行。

当你希望 claude.ai 能存取 repo 内容（包含 agent 定义、references、范例输出）以便阅读与引用，但不需要 agentic skill execution 时，使用此方式。若要做 agentic execution，请改用方法 3（Cowork）的桌面环境，或方法 1、方法 2 在 扩展智能体运行环境 内执行。

1. 登入 [claude.ai](https://claude.ai)。
2. 建立新 Project：**Projects** → **Create Project**。
3. 从 GitHub 汇入：在 Project 中，点击 **Files** → **+** → **GitHub** → 选择 `Imbad0202/academic-research-skills`。
4. 选取以下资料夹与档案。

   | 选取 | 目录 / 档案 | 原因 |
   |---|---|---|
   | ✅ | `deep-research/` | 核心 skill 内容，可供阅读 |
   | ✅ | `academic-paper/` | 核心 skill 内容，可供阅读 |
   | ✅ | `academic-paper-reviewer/` | 核心 skill 内容，可供阅读 |
   | ✅ | `academic-pipeline/` | 核心 skill 内容，可供阅读 |
   | ✅ | `shared/` | 跨模型验证、handoff schemas、共用 protocols |
   | ✅ | `scripts/` | `literature_corpus[]` adapters（`folder_scan`、`zotero`、`obsidian`）与 schema validators；Material Passport corpus mode 与 CI-style validation 需要 |
   | ✅ | `MODE_REGISTRY.md` | Mode definitions |
   | Optional | `.claude/` | Project-level routing rules。若你在下方步骤 5 设定 Project Instructions，建议跳过；只有在你偏好把 routing rules 作为 Project files 显示时才纳入。 |
   | Optional | `examples/` | 可作为参考范例；若想缩小 Project 知识库，请跳过 |
   | Optional | `.github/`、READMEs、LICENSE 等 | Repository metadata；核心阅读 context 不需要 |

5. （建议）将 `.claude/CLAUDE.md` 的内容设为 Project 的 **Instructions**，以获得更好的 routing。
6. 开始对话："Guide my research on X" 或 "Help me write a paper about Y"。

Anthropic 目前的 [Project file limits](https://support.claude.com/en/articles/8241126-upload-files-to-claude) 说明：Project 并未刻意设定 200 档上限，但每个档案有 30 MB 大小限制，总可用内容仍受 runtime context-window 影响。请让 Project 保持聚焦，Claude 才能稳定撷取相关档案。

#### 方法 4a：Custom Skill upload（不推荐给本 suite）

方法 4a 是 claude.ai 标准的 Custom Skill 安装路径：把每个 skill 资料夹压成 zip、透过 Settings → Capabilities → Skills 上传，Claude 会把它当成已安装的 Skill，提供自动载入与 routing。claude.ai Custom Skills 确实支援多档 skill 套件，包含 `scripts/`（请见 Anthropic 的 [How to create custom Skills](https://support.claude.com/en/articles/12512198-how-to-create-custom-skills) 对 supporting files 与 code execution 的说明），所以方法 4a 在机制上是可以 host 带可执行档的 skill 的。但**不推荐给本 suite 使用**，原因如下，且两者叠加：

1. **ARS 仰赖 扩展智能体运行环境 专属的编排功能**。每个 ARS skill 透过 扩展智能体运行环境 的 Task / subagent 工具驱动 12-13 个专责 agent，并透过 Material Passport 在跨 session 之间交接档案。Anthropic 文件描述的 claude.ai Custom Skill runtime（每个 session 一个 containerised code-execution 环境，[Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude) 说明 skill 启动，但没提到 multi-agent dispatch）并不包含 扩展智能体运行环境 的 Task / subagent 控制面。可预期方法 4a 会把 ARS 呈现为 SKILL.md body 的 instructions，但缺少实际产出 suite 结果的 multi-agent dispatch。我们未实际 live upload 量测这项；本建议是基于 ARS agent 编排对 扩展智能体运行环境 的依赖推论而成，并非实测失败。
2. **会降低 扩展智能体运行环境 与 Cowork 的 routing 精度**。claude.ai 在 [Custom Skills 文件](https://claude.com/docs/skills/how-to) 把每个 skill 的 `description` 限制在 200 字元，但 [Agent Skills specification](https://agentskills.io/specification) 与 [扩展智能体运行环境 Skills 文件](https://code.claude.com/docs/en/skills) 都允许到 1,024 字元。本 suite 四个 description 目前在 440-842 字元区间，前段 front-load 了 扩展智能体运行环境 与 Cowork 用来区分研究、写作、审查、orchestration 的 routing 关键字。为了 fit 方法 4a 而砍 description，会削弱 ARS 实际运作平台（扩展智能体运行环境 与 Cowork）上的 routing，换到的只是 claude.ai 上未经实测的部分相容。

**建议的替代路径：**

- 桌面端做 agentic skill execution，请用方法 3（Cowork）。四个 skill 都会在 Cowork 注册为 capabilities，多 agent 协作完整保留。
- claude.ai 网页端要存取 repo 内容，请用方法 4b（Project + GitHub integration，本节稍前说明）。Claude 可以读取 skill 主体、references 与范例，你可以在 claude.ai 一般对话中提问或起草。
- 扩展智能体运行环境 专案请用方法 1（project skills）或方法 2（standalone）。

如果你看完上述限制后仍想试方法 4a，每个 zip 都必须把 skill 资料夹放在最上层，所以 zip 内容应包含 `<skill-name>/SKILL.md`，而不是 `<skill-name>/<skill-name>/SKILL.md`（多包一层会把 discovery 档案藏到下一层）。下面的 `zip -r` 指令会产出正确的 zip 结构：

```bash
git clone https://github.com/Imbad0202/academic-research-skills.git
cd academic-research-skills

zip -r deep-research.zip deep-research
zip -r academic-paper.zip academic-paper
zip -r academic-paper-reviewer.zip academic-paper-reviewer
zip -r academic-pipeline.zip academic-pipeline
```

接著在 claude.ai：

1. 登入 [claude.ai](https://claude.ai)。
2. 开启 **Settings**。
3. 开启 **Capabilities**。
4. 开启 **Skills**。
5. 上传 `deep-research.zip`。
6. 上传 `academic-paper.zip`。
7. 上传 `academic-paper-reviewer.zip`。
8. 上传 `academic-pipeline.zip`。

每个 zip 都会被 upload UI 以 description 过长拒绝，因为 ARS 所有 description 都超过 claude.ai 200 字元上限。Description 维持原状并非疏忽，原因见上方说明。

**claude.ai 与 扩展智能体运行环境 的差异：**

- 方法 4b 用于内容阅读，不是主动 Skill execution。若需要 agentic skill execution，请优先使用方法一、方法二、方法三。
- claude.ai 不支援本机 shell commands；结果可能不如依赖本机 scripts 的 扩展智能体运行环境 workflows 完整。
- 跨模型验证（`ARS_CROSS_MODEL`）需要 扩展智能体运行环境 与 API keys。
- 直接产出 `.docx` 需要 Pandoc，LaTeX/PDF 输出需要 扩展智能体运行环境 搭配 `tectonic`；claude.ai 仍可产出 Markdown 与 DOCX 转换说明。