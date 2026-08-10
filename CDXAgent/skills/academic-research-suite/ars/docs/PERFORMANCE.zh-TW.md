# ARS 效能说明

> **建议模型：当前最新一代 Claude 模型**（撰写当下为 Fable 5），搭配 **Max plan**（或同等配置）。现行 Claude 模型采用 adaptive thinking，不需要手动指定 thinking budget。
>
> 完整学术 pipeline（10 阶段）会消耗**大量 token** — 单次完整执行可能超过 200K 输入 + 100K 输出 token，视论文长度和修订轮数而定。请依预算斟酌使用。
>
> 单独使用个别 skill（如只用 `deep-research` 或 `academic-paper-reviewer`）的消耗明显较少。

## 各模式 Token 消耗估算

| Skill / 模式 | 输入 Token | 输出 Token | 估算费用 |
|---|---|---|---|
| `deep-research` socratic | ~30K | ~15K | ~$0.60 |
| `deep-research` full | ~60K | ~30K | ~$1.20 |
| `deep-research` systematic-review | ~100K | ~50K | ~$2.00 |
| `academic-paper` plan | ~40K | ~20K | ~$0.80 |
| `academic-paper` full | ~80K | ~50K | ~$1.80 |
| `academic-paper-reviewer` full | ~50K | ~30K | ~$1.10 |
| `academic-paper-reviewer` quick | ~15K | ~8K | ~$0.30 |
| **完整 pipeline（10 阶段）** | **~200K+** | **~100K+** | **~$4-6** |
| + 跨模型验证 | +~10K（外部）| +~5K（外部）| +~$0.60-1.10 |

*以 ~15,000 字论文、~60 篇引用为基准估算。实际消耗随论文长度、修订轮数、对话深度而异。费用以 Opus 4.x 实测、Anthropic API 2026 年 4 月定价计算；换用更新模型时请当成数量级参考，不是精确报价。*

> **v3.11 引用查验（#182）。** 确定性引用存在性 gate 呼叫的是外部书目 API（Semantic Scholar / OpenAlex / Crossref / arXiv），不是 LLM，因此**不增加上表的 Claude token 成本**——只在首次查询时有网路延迟。持久化 SQLite cache（`~/.cache/ars/verification.db`，90 天 TTL）让每篇论文只查验一次、跨草稿重用；对已 cache 的书目重跑不做任何网路请求。见 [SETUP](SETUP.zh-TW.md#引用查验-cachev3.11182)。

## 建议 扩展智能体运行环境 设定

| 设定 | 功能说明 | 启用方式 | 官方文件 |
|---|---|---|---|
| **Agent Team**（选用） | 启用 `TeamCreate` / `SendMessage` tools 做手动多 agent 协作。**ARS 内部平行化不需要这个 flag** — skills 透过内建 `Agent` tool 直接 spawn subagent。仅在你想手动跨 session 协作持久 team 时有用。 | 设定 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（研究预览） | 实验性功能 — 尚无稳定文件 |
| **Auto 模式**（建议） | 自动接受大多数工具动作，让长时间 pipeline 大幅减少中断；同时由伺服器端 classifier 挡下超出你请求范围的危险动作（例如部署到 production、force-push 或直接 push main、资料外泄）。明确的 ask 规则与 classifier 拦截仍可能跳出确认。是「手动逐项确认」与「完全不检查」之间的折衷。 | 启动时加上 `claude --permission-mode auto`（若可用），或在 `~/.claude/settings.json` 设定 `"permissions": { "defaultMode": "auto" }`；启动后确认当前模式（研究预览） | [Permission modes](https://code.claude.com/docs/en/permission-modes) |
| **Skip Permissions** | 跳过例行的工具使用确认，且不做任何安全检查。比 auto 模式更快，但移除所有护栏。设计用途是用完即抛、无网路连线的隔离沙箱，不适合真实开发机器。 | 启动时加上 `claude --dangerously-skip-permissions`（等同 `--permission-mode bypassPermissions`） | [Permission modes](https://code.claude.com/docs/en/permission-modes) |

> **⚠️ 模式选择**：大多数无人值守的 pipeline，建议使用 auto 模式。它让长时间执行大幅减少中断，同时由 classifier 挡下超出你请求范围的危险动作，但 ask 规则与 classifier 拦截仍可能跳出确认。auto 模式是研究预览：它不保证安全，也不能取代敏感操作的人工审查，且行为可能变动。Skip Permissions 则完全移除这层安全网，仅应在无网路连线的隔离沙箱中使用，且你要确定可以接受 Claude 在无检查的情况下执行档案读写与 shell 指令。

### v3.7.0 Plugin agent 与模型路由

当 ARS 以 扩展智能体运行环境 plugin 方式安装（`/plugin install academic-research-skills`）时，会把三个下游 worker agent 暴露为 plugin-shipped subagent：`synthesis_agent`、`research_architect_agent`、`report_compiler_agent`。三个 agent frontmatter 都标 `model: inherit`，意思是它们**继承派工 session 的模型**而非写死特定 floor：

- Opus session 跑完整 pipeline 时 agent 是 Opus，保留这三个 agent 设计的整合深度。
- Sonnet session 取得 Sonnet agent，跟主 session cost / latency 对齐。
- Agent 永远不会默默掉到 Haiku — `inherit` 走的是主 session 模型，主 session 本身又被「ARS 全程不用 Haiku」政策守住。

意涵：**plugin agent 的 token 成本完全跟著上表各模式估算走，没有额外加减**。dispatched agent 跟主 session 同一个模型，主 session 已经付的成本没有再多一层 plugin agent 收费。如果 pipeline 中途换模型（例如 revision pass 改用 Sonnet 省成本），下一轮 agent 派工自动跟上。

其他 ARS agent（`bibliography_agent`、`literature_strategist_agent` 等）在 v3.7.0 不暴露为 plugin agent；它们仍是 in-skill prompt template，由主 session 内联执行，没有独立的模型路由层。更广的 plugin agent 覆盖留到后续版本。

## 长时间 session 管理

完整 pipeline 设计为 human-in-the-loop，每个阶段都需使用者确认。实务上一次完整执行会跨越数小时到数天，远长于 Anthropic 的 prompt cache TTL（5 分钟）。两项结果：

1. **阶段间 cache miss 是常态。** 当 stage checkpoint 停留超过 5 分钟，下一阶段会以未快取状态读取 context。这是 human-paced pipeline 不可避免的成本。
2. **跨 session 续跑依赖 Material Passport。** ARS 本身不跨 session 保留 orchestrator 状态。要在新 session 续跑，把 Material Passport YAML 贴回即可；orchestrator 读取 `compliance_history[]` 与阶段完成标记定位中断点。

### v3.6.2 Sprint Contract 审稿成本（`full` / `methodology-focus` 模式必跑）

Schema 13 sprint contract 把每个 reviewer agent 切成 Phase 1（不见论文、先承诺评分准则）+ Phase 2（看论文做审稿）两阶段。已 ship template 的两个模式（`full` panel 5 + `methodology-focus` panel 2）下，每位 reviewer 约等于跑两个 LLM turn。保留模式（`re-review` / `calibration` / `guided` / `quick`）维持 pre-v3.6.2 行为。

| Skill / 模式 | Token 影响 | 备注 |
|---|---|---|
| `academic-paper-reviewer full` | 每位 reviewer 约 +30-40% input + 小幅 output × 5 位 | Phase 1 读 contract template + 论文 metadata；Phase 2 读完整论文 |
| `academic-paper-reviewer methodology-focus` | 同上 shape，panel 2 | EIC + methodology 两位 reviewer 各跑两阶段 |
| Synthesizer（固定一个）| +~2-3K input | 读 contract + 各 reviewer 输出，跑三步机械协议 |

实测待真实大规模审稿后校准。两阶段架构是 gated mode 的不可选 overhead，不是 tunable。

### v3.4.0 compliance agent 成本

在 Stage 2.5 与 Stage 4.5 加上 mode-aware `compliance_agent` 会让 SR 全 pipeline token 多出：

| Skill / 模式 | 输入 Token | 输出 Token | 估算费用 |
|---|---|---|---|
| `deep-research systematic-review`（仅 2.5）| +~5–8K | +~3–5K | +~$0.15 |
| 全 pipeline SR（2.5 + 4.5）| +~10–15K | +~5–8K | +~$0.30 |
| `academic-paper full`（pre-finalize）| +~3–5K | +~2–3K | +~$0.08 |

以上为既有 per-skill 成本之上的额外增量（与上表共用 15,000 字 / 60 篇引用基准，见上表下方 footnote）。跨模型验证成本（若启用）维持不变。

### v3.6.3 Passport 重置边界（opt-in）

设定 `ARS_PASSPORT_RESET=1` 后，每个 FULL checkpoint 变成 context 重置边界。预期工作流程：

1. Session A 跑完一个 stage 到 FULL checkpoint。
2. 从 checkpoint 通知抄下 `[PASSPORT-RESET: hash=<hash>, stage=<completed>, next=<next>]` tag。
3. 开新的 扩展智能体运行环境 session（session B），贴入 `resume_from_passport=<hash>`。支援可选覆盖：`resume_from_passport=<hash> stage=<n> mode=<m>`。
4. Session B 只读 passport ledger，不重播 session A 的对话。Orchestrator 找到相符的 `kind: boundary` entry，append 一个 `kind: resume` entry 完成消费，然后继续。继续的 stage 由以下顺序决定：使用者在 resume 指令附上 `stage=` 时以其为准，否则当 boundary 带 `pending_decision` 时由 orchestrator 先重新询问使用者再用对应选项的 `next_stage`，否则才采用记录的 `next` 栏位。所有选项都终止时，`next` 可以是 `null`。

**何时重置比延续划算：**

- 长 pipeline，session A 累积 >100K input token，下个 stage 不需要这些上下文。
- `systematic-review` 模式，stage 独立性由 Material Passport 精确界定。
- 撞到 5 分钟 prompt cache TTL：重置让下个 stage 重新起算，不用在臃肿 context 上付 cache miss。

**何时延续仍然比较好：**

- 短 pipeline（end-to-end < 30K input token）。
- Stage 有 in-session 隐含状态、passport 没带的情况（例如使用者想保温的 Socratic 对话分支）。
- Flag OFF 时，延续是不变的 pre-v3.6.3 预设。

**Passport 档案位置规约：**

Orchestrator 预设在目前工作目录下寻找 `./passports/<slug>/` 或 `./material_passport*.yaml`。将 hash 解析到磁碟上的 passport 档案是整合方的责任，orchestrator 载入呼叫端工具提供的 passport。预设位置见上方 `./passports/<slug>/` 规约。

Resume 指令只定义 hash 与可选的 stage/mode 覆盖：

```
resume_from_passport=<hash> [stage=<n>] [mode=<m>]
```

Resume 指令本身没有路径语法。客制 passport 位置在专案的 `CLAUDE.md` 设定，或由整合方的工具在呼叫 orchestrator 前处理。

**实测 token 节省：** 尚待真实 `systematic-review` 搭配仪器化测量。取得实测资料后会回填本节。目前不做任何数值宣称。完整协议见 [`../academic-pipeline/references/passport_as_reset_boundary.md`](../academic-pipeline/references/passport_as_reset_boundary.md)。

## 文献语料库导入（v3.6.4+）

Material Passport 的 `literature_corpus[]` 栏位由**使用者自行撰写的 adapter** 产出，不是 ARS 本身。v3.6.4 附三个 reference adapter：`scripts/adapters/folder_scan.py`、`scripts/adapters/zotero.py`、`scripts/adapters/obsidian.py`。执行方式与自行撰写 adapter 的指引见 [`scripts/adapters/README.md`](../scripts/adapters/README.md)。

### 效能定位

- Adapter 在 ARS session 之外执行（跑 ARS 前跑）；执行时间由使用者自行负责，不进 ARS 的时间预算。
- Adapter 必须具备 determinism：同一份 input 重跑产出 byte-identical 输出（时间戳除外）。
- `literature_corpus[]` 依 `citation_key` 排序；`rejection_log.rejected[]` 依 `source` 排序。
- Adapter 输出大小与语料库大小线性成长。500 笔 Zotero 书目约产出 300 KB 的 passport YAML。大型语料库建议 ARS 消费端采 lazy load。

### 导入层边界

- 不读 PDF 内容、不做文字抽取、不跑 OCR。
- 不呼叫 Zotero Web API、Notion API 或任何远端服务。
- 不抓付费墙后内容、不用使用者凭证连线机构图书馆。

这些边界是刻意的，反映 ARS 的 data-layer 定位：ARS 是 writing / review layer 的框架，语料整合留在 user-owned code。如需 API-based live-sync adapter，由使用者以三个 reference adapter 为起点自行撰写。

### 消费端整合

v3.6.5 起，Phase 1 两个文献 agent 透过 **corpus-first、search-fills-gap** 流程读取 `literature_corpus[]`：`deep-research/agents/bibliography_agent.md` 与 `academic-paper/agents/literature_strategist_agent.md`。两者走相同的五步流程与四条 Iron Rule（Same criteria / No silent skip / No corpus mutation / Graceful fallback on parse failure）。Search Strategy 报告新增 PRE-SCREENED 可重现区块，列出已纳入／排除／略过的 corpus entry，并含 F3 zero-hit 与 F4 provenance 报告。消费端启动采 presence-based — passport 带非空 `literature_corpus[]` 且解析成功时自动进入；解析失败时 fallback 到 external-DB-only flow，并 surface `[CORPUS PARSE FAILURE]`。

完整 consumer 协定见 [`academic-pipeline/references/literature_corpus_consumers.md`](../academic-pipeline/references/literature_corpus_consumers.md)。`citation_compliance_agent` 的 corpus 整合留到 v3.6.6+。

### v3.6.5 corpus consumer 成本（presence 触发）

Material Passport 带非空 `literature_corpus[]` 时，Phase 1 读取量随 corpus 大小线性增长。PRE-SCREENED block 的 emit 本身属 prompt-layer（成本可忽略）；LLM 成本来自 Step 1 pre-screening — 对每笔 corpus entry 套用当前 Inclusion / Exclusion 条件，比对 `title`（一定有）与已填的选填栏位（`abstract` / `tags`）。

| Corpus 规模 | Step 1 pre-screening（每位 consumer）| 备注 |
|---|---|---|
| 空 / 不存在 | 0 | external-DB-only flow 维持原样 |
| ~50 笔（典型 Zotero 子集）| +~3-5K input + ~1-2K output | title + abstract 扫描 |
| ~200 笔 | +~10-15K input + ~3-5K output | title-only 扫描为主，abstract 视填充情况 |
| ~500 笔（大型文献库）| +~25-40K input + ~8-12K output | passport emit 前考虑先精简 corpus |

Step 2 search-fills-gap 在 `uncovered_topics` 小（case A）时会降低 external-DB 成本，可部分抵销 Step 1。净效应实测待真实 SR run instrumentation 后校准；目前不下总体数字结论。Parse 失败约一个短 turn 成本（parse + emit `[CORPUS PARSE FAILURE]` + fallback）。
