# ARS 资深研究者视角盲点盘点

| | |
|---|---|
| 日期 | 2026-06-10 |
| 基准 | main `6252b1b`（v3.12.0 + Item 7 spec） |
| 性质 | 产品级审查：这套工具拿来产真论文，缺什么、挡什么、骗了自己什么 |
| 研究者画像 | 高教品保领域、systematic review／政策研究、中英双语投稿、单人为主偶有共作 |
| 外部输入 | AACSB Global Research Impact Task Force, *A Framework for Research Impact* (May 2026) |
| 审查轨迹 | 初稿 → 主 context 自查（3 修正）→ codex 0.137 high + gemini-3.1-pro dual-track（11+7 findings）→ 本版 |
| 状态 | 待使用者裁定；裁定前不开 issues |

分类标记：**【盲点】**初衷内该有而没有／**【增补】**初衷外但高价值，附说服理由／**【non-goal】**诚实列出为什么不做。撞已拍板 negative scope 的提案，明写要求推翻哪条决策。

---

## 0. 一句话结论

ARS 是一台「文献→写作→审查→修订」中段防错密度极高的单篇论文品管机；它最大的结构性问题不在中段（中段是强项），而在三处：**(1) 跨篇 research program 层级的 state 为零**，每篇论文都从失忆开始（是盲点还是 scope 外，送裁定）；**(2) 品质机制全部回答「这篇有没有错」，没有任何机制让「这篇无懈可击但平庸」变得可见**；**(3) 工具的旗舰防线（deterministic citation verification）在使用者自己的研究类型（政策研究、灰色文献为主）上覆盖率系统性最低**。

Dual-track 补了第四条：本盘点初稿自己也犯了「AI 对自写物 anchoring」的错——两个提案（F-4、F-5 之半）提的是 repo 已存在的东西，一个提案（F-2 novelty mirror）原始形状踩了 hidden-ranking 红线。修订记录保留在各节，因为这些误判本身就是「为什么这个 repo 需要 cross-model 审」的现场证据。

---

## 1. 研究生命周期走查

生命周期：**grant/计划申请** → RQ 孵化 → 文献 → 方法设计 → 实验/资料 → 分析 → 写作 → 内部审查/修改 → 投稿 → rebuttal → camera-ready → 发表后 → 下一篇。（grant 段是 gemini 审查补上的，初稿漏列，见 F-13。）

| 阶段 | 覆盖 | 深度 | 判定 |
|---|---|---|---|
| grant/计划申请 | funding_statement_guide（formatter reference）为止 | 近零 | **未拍板留白**：F-13 |
| RQ 孵化 | deep-research `socratic`（5-layer）+ FINER guidance-tool 对话 + #257 wording advisory | 完整对话工作流；Layer 1/5 已含 impact 探问（dual-track 修正，见 F-4 撤回纪录） | 盖到 |
| 文献搜寻/筛选 | `lit-review` / `systematic-review`（PRISMA）+ literature_corpus + 四索引 citation gate | 全 suite 最厚 | 盖到；灰色文献低覆盖（F-3） |
| 方法设计 | research_architect（Methodology Blueprint）；preregistration 仅 reference | Blueprint 为止 | 盖到 |
| 实验/资料搜集 | 无。#260 只做 scholar 宣告的 provenance intake | 仅 intake/audit | **non-goal（正确）**：Kong §3.3 rejected；companion experiment-agent 接手 |
| 分析 | synthesis（文献层）+ meta_analysis（SR）+ figure fidelity gate #261 | 文献层完整；primary data 分析无 | non-goal（experiment-agent 领地），边界清楚 |
| 写作 | academic-paper 10 modes、12 agents、style calibration、anti-leakage | 完整 | 盖到 |
| 内部审查/修改 | reviewer 6 modes + in-pair evaluator + R&R traceability + revision/revision-coach | 全 suite 最厚 | 盖到；「建设 vs 防御」失衡（F-2） |
| 投稿 | formatter：cover letter、CRediT 14 角色模板、DAS 四模板、COI/funding/ethics、双盲版去作者资讯、Pre-Output Final Checklist（皆 prompt 层）；disclosure mode；journal_submission_guide（含 TSSCI 节） | **prompt 层 checklist 完整**（初稿低估，codex 修正）；deterministic 验证零 | F-5 改写后仍立案：gap 是 deterministic 化不是从无到有 |
| rebuttal/response | `revision`（point-by-point R&R）+ `revision-coach`（Response Letter Skeleton）吃外部审稿意见 | 完整工作流 | 盖到 |
| camera-ready | format-convert（LaTeX/DOCX/PDF）为止 | 排版机械层 | 盖到 |
| 发表后 | monitoring_agent（optional：retraction/correction alert、contradictory findings、author tracking）+ literature_monitoring_strategies（citation alert 指南） | advisory 指南层，非主流程（初稿写「全空白」过度，codex 修正） | 残余 gap 窄而明确：F-7 |
| 下一篇（research program） | 无任何机制 | 零 | **F-1**：事实成立，分类送裁 |

走查结论：中段密度世界级。前端薄是 deliberate（实验外包、idea generation 是 Kong L2 红线）。**grant 段与「发表后+下一篇」段是未经裁定的留白**——没有任何 design lesson 记录过为什么不做，跟五条 Rejected mechanisms 的待遇不对等。这是本盘点送裁定的核心。

---

## 2. 发现总表（dual-track 修订后）

| # | 发现 | 分类 | 状态 |
|---|---|---|---|
| F-1 | 跨篇 research program state 为零 | 增补（scope 裁定）；初稿标盲点，codex 论证 POSITIONING 写的是 research-to-publication 不含 program 管理，降级 | 送裁 §3 |
| F-2 | 品质机制无「平庸可见性」 | 盲点 | 立案 §4；形状 2 经 codex 抓出红线问题后重设计 |
| F-3 | 灰色文献在四索引 citation gate 下系统性低覆盖（初稿「全部查无」过度，已软化） | 盲点 | 立案 §6.2 |
| F-4 | ~~RQ 孵化缺 impact-pathway 探问~~ | **撤回** | §5.1 保留撤回纪录：提案内容已存在于 socratic Layer 1/5 |
| F-5 | submission package 检查的 deterministic 化（初稿「无此功能」错；prompt 层 checklist 已完整） | 增补 | 改写后立案 §5.2 |
| F-6 | venue selection 无支援 | 增补（撞线） | §5.3；dual-track 后条件收窄为 scholar-supplied candidate universe |
| F-7 | 发表后段残余 gap：自我论文的 citation-context audit、errata workflow、OA self-archiving 合规 | 增补（要动 POSITIONING scope） | 改写后立案 §5.4 |
| F-8 | env flag 无单一总表（7 个 user flag，SETUP.md env 表列 5）；安全功能全 opt-in 预设关 | 盲点 | 立案 §7.1（数字经自查修正，codex 同向确认） |
| F-9 | Dogfooding 半断流：worked example 停在 v2.7；v3.8 之后版本全为外部论文驱动（初稿「v3.4 之后全论文驱动、真实使用零痕迹」错——v3.6.7 即 chapter-run 驱动且有 spec 记录） | 盲点（窗口收窄后仍成立） | 立案 §7.2 |
| F-10 | 中文线止于排版：TSSCI 检索/引用/字体有，中文审查惯例与投稿 workflow 无 | 增补 | 立案 §6.1 |
| F-11 | Multi-author：team_collaboration_protocol.md 已有 human-convention 层（初稿「零支援」错）；passport 层 multi-author state 为零 | non-goal 维持 | §8 |
| F-12 | plain-language summary / 衍生物 | non-goal 维持（撞 Paper2X），理由 §8 | — |
| F-13 | grant/funding lifecycle 整段不在走查与产品内（gemini 补抓） | 增补（scope 裁定） | §5.5 |
| F-14 | bonus hygiene：Originality 权重 repo 内部不一致（quality_rubrics.md 20% vs review_criteria_framework.md 15%，codex 抓） | 盲点（小） | 顺手修，可直接开 issue |

---

## 3. F-1 跨篇知识累积：research program 层级失忆【增补，scope 裁定】

### 事实（未被任何审查挑战）

所有跨 session 机制都是**单篇内**的：Material Passport 是 per-run state；`resume_from_passport` 续同一 run；`compliance_history[]`、`reset_boundary[]`、`experiment_provenance[]` 都挂在单篇 passport 上。唯二跨篇的东西：verification cache（引用查核的效能快取）、`literature_corpus[]`（使用者外部维护重喂，No corpus mutation Iron Rule 明文不回写）。

真实研究者的工作单位是研究线不是论文：同批文献写三篇、上一篇的 limitations 是下一篇的 RQ 种子、上一篇被 reviewer 打过的弱点下一篇先补、paper A 主张过 X 则 paper B 不能无意识主张 ¬X。ARS 自己的机制已经在单篇内生产这些资产（Stage 6 AI Self-Reflection、Acknowledged Limitations、R&R Traceability Matrix），但 run 结束即死。

### 分类修订（codex P1）

初稿标【盲点】，论证是「copilot 服务 scholar，scholar 的存在形式是研究线」。codex 反驳：POSITIONING 的自我定义是 "full research-to-publication pipeline"——publication 是终点，research program 管理是扩张解释。我接受：**这是 scope 决定不是落在既有 scope 内的漏洞**，改标【增补】，裁定权在使用者。AACSB spiral model（outcome 回馈下一轮 inquiry）是扩的理由，不是已承诺的依据。

### 红线检查（dual-track 后收紧）

「上一篇 limitation → 下一篇 RQ」做成 ARS 主动提案 = 撞 Kong L2。codex 进一步指出：L2 的 verb test 允许的是「对 scholar-supplied RQ 的 wording advisory」，**pre-RQ 阶段 surface 上篇 limitations 并不在 L2 的明文允许清单内**，属于 L2 没有预想过的新 seam。合规形状因此要满足三个条件（codex 修订）：

1. **Scholar-initiated**：scholar 明示「载入我的研究线」才启动，不是新 run 自动跳出。
2. **All-artifacts-visible**：呈现该研究线的全部 prior limitations / 未解意见，不做「最相关的三条」这种隐性筛选（同 hidden-ranking 原则）。
3. **不 derive**：呈现原文 + Socratic 问句为止，不从 limitation 推导、改写或排序候选 RQ。

跨篇 claim 一致性检查（自我前作的 claim registry 对照）是 audit 不是 generation，#262 机制形状可复用，红线风险低。

### 与 data layer boundary 的关系（送裁）

2026-04-22 的禁令挡的是「整合外部 corpus」；research-line ledger 承接的是 **ARS 自产 artifacts**（passport、reflection、R&R matrix——格式 ARS 定义、内容 ARS 产出）。我判断不在禁令射程内，但边界是使用者拍的板。

### 裁定问题

要不要开「research line passport」设计线？最小切片：①scholar-initiated 的 prior-limitations advisory surface（上述三条件）；②自我 claim registry 的 cross-paper audit。若裁定不做，建议把「research program 层」明文写进 POSITIONING non-goal——现在它是留白，跟五条 Rejected mechanisms 的记录纪律不对等。

---

## 4. F-2 防御性品质 vs 建设性品质：「无懈可击但平庸」会全绿通过【盲点】

### 事实

防错侧：DA 3 mandatory checkpoints、Stage 2.5/4.5 integrity（zero issues 才放行）、7-mode failure checklist（no escape hatch）、generator-evaluator contract、sprint contract、citation gate、claim audit、49 条 lint。防的全是 hallucination / drift / corruption / sycophancy。

提质侧：理论贡献与论证锐度只出现在**评分侧**（EIC/peer review 的 Originality 加权——主 rubric 20%，旧 reference 残留 15%，见 F-14）与**防守侧**（DA So-what test、CER stress test）。写作期/修订期的 coaching 全面降维到流程与排序（「选三件事改」「排优先序」）。Socratic 的深度集中在 RQ 期（5-layer 含 assumption probing 与 significance），**不延伸进写作期**：没有任何 mode 在 drafting/revision 阶段陪 scholar 磨「这篇对哪条理论线的推进点、跟哪个学派对话、delta 在哪」。

结构性后果：一篇文献完备、引用全验证、统计无误、论证结构完整、回应了所有模拟审稿意见的论文，可以全闸绿灯通过——而它可能是 AACSB p.13 受访者批评的 "micro extensions of what we already know"。reviewer panel 忠实模拟现行 journal review 体制，等于把该体制推向保守增量的力场也内建了。25 modes 的 spectrum 分布（14 Fidelity / 7 Balanced / 4 Originality）显示系统重心本来就在 fidelity。

### 与 S0 洞见的镜像关系

HEEACT 评鉴工具加 S0 的原因是「AI 把报告写到无懈可击 = 品质讯号失效」。ARS 站在生产端，正是那台把论文写到无懈可击的机器。评鉴端已知 compliance ≠ perfection；生产端还没有对应自觉。解法不是让 ARS 学会判断论文价值（LLM 判 novelty 不可靠，v3.0 自承 DA "attacks arguments, never premises"），是让**平庸这个属性变得可见**，判断留给 scholar。

### 修补形状（dual-track 后修订）

1. **Contribution sharpening 对话层**【维持】：把 socratic Layer 5（SIGNIFICANCE & CONTRIBUTION，已存在于 RQ 期）的问句结构**延伸进 plan mode 与 revision coaching**（"十年后引用本文的人会说它证明了什么？" "拿掉本文，这条文献线少了哪块？"）。改动小：plan_mode_protocol 与 Phase 2.5 coaching 各加一节，问句直接从 socratic_mentor_agent Layer 5 移植。过 L2（问不给）。
2. **Novelty delta 镜子**【初稿形状踩线，重设计】：初稿提「本文 claim ↔ 三篇最近邻文献」对照表。**codex 抓出红线问题：「选哪三篇」本身就是 hidden selection pressure，Co-Scientist L1 管的是候选集隐性建构与 anchoring，不是最后有没有写「你决定」**。重设计后的合规形状：对照集由 scholar 指定（"跟这五篇比"），或 enumerate 全部 bibliography 中标记为 same-RQ 的 entries（全集可见、不选样）。成本变高，价值降低；**优先级降到形状 1 之后**，甚至可以不做。
3. **Practitioner/policy-reader persona**【维持，诚实标注】：field_analyst 动态配 reviewer 机制现成，加一个非学术读者 persona。LLM 模拟 practitioner 仍是 LLM，价值是视角多样性不是真 stakeholder。

教训记录：「advisory ≠ 自动红线安全」。本盘点初稿把 advisory 当免死金牌用了一次，被两个模型从不同条目（F-2、F-6）独立抓到同一原则。这条应该写进未来所有 ARS 提案的 review 惯例：**检查红线时，先检查候选集是怎么建构的，再检查最后谁决定**。

### 裁定问题

推荐先做形状 1（最便宜、问句现成、最贴 Socratic DNA）。形状 2 重设计后还值不值得做，送裁。

---

## 5. 生命周期断点的修补提案

### 5.1 F-4 撤回纪录：impact-pathway 探问已存在

初稿提案「socratic 加 impact-pathway 探问维度」。**Dual-track 两模型一致打掉前提**：`socratic_mentor_agent.md` Layer 1 已有 "If your research succeeds, how would the world be different?" / "Important to whom?"，Layer 5（SIGNIFICANCE & CONTRIBUTION）已有 "If your research succeeds, who would make different decisions as a result?" / "Who benefits once it's filled?"；`research_question_agent.md` 明写 FINER 是 "guidance tool (not a scoring tool): Designs 2-3 guiding questions for each FINER dimension"。我提案要加的问题逐字级地已经存在。

误判根因：subagent 地图只读了 SKILL.md 层（拿到 5-layer 的名字没拿到 agent prompt 的问句），主 context 自查的 grep 关键词（stakeholder / impact pathway / who will use）漏掉了实际表述（how would the world be different / who would make different decisions）。关键词锚定偏误 + 对自写提案的 anchoring，双重失效；同 model 的独立 context（codex prompt 内含维度提示）反而抓到。

残余 gap 只剩一条小的：Layer 5 的探问停在「谁会不同」，没有「发表载体通路」的具体化（学术期刊 vs 评鉴准则 vs 政策白皮书——对政策研究者这是 RQ 期就该想的 dissemination 路径）。价值低，不独立立案，并入 F-2 形状 1 的问句清单即可。

### 5.2 F-5 submission package 的 deterministic 化【增补，改写后立案】

初稿宣称「submission package 完整性检查无」。**codex 修正：formatter_agent prompt 层已有完整 checklist**——双盲版去作者资讯（:673）、CRediT 14 角色模板、DAS 四模板、COI/funding/ethics statement、Pre-Output Final Checklist（内容完整性+格式合规+必要元素+投稿包四节，any FAIL → fix and re-check）。

改写后的真 gap：**这些全是 prompt 层 checklist（LLM 自我核对），零 deterministic 验证**。对照 ARS 自己的演进逻辑——citation 从 prompt 层防线走到 #182 deterministic gate 花了 8 轮——submission package 正站在同一条演进线的起点。最值得 deterministic 化的三项：①双盲去识别化残留扫描（PDF metadata 作者栏、acknowledgments、自引措辞 "in our previous work"、补充档档名）——纯 script 可验、失败成本高（desk reject）、对单人研究者（没有第二双眼睛）价值最大；②字数/结构限制 vs venue 宣告的机械比对；③reference list ↔ 正文引用的双向 set 比对。另 codex 指出 `repro_lock` 明文不被 integrity gate 读（artifact_reproducibility_pattern.md:120-128）——transparency 链最后一哩断在这里，可并入同一个 verifier。

### 5.3 F-6 venue selection【增补，撞线，条件收窄】

现况：无 mode、无 agent；top_journals_by_field.md 是 EIC calibration 内部 reference。

**红线分析（dual-track 后收窄）**：gemini 维持我的撞线判定并补刀（「AI 内部 retrieval 哪些 venue 显示，本身就是 Top-K filter」）；codex 给出唯一可行形状的精确条件：**candidate universe 必须 scholar-supplied 或 exhaustively disclosed**。亦即 ARS 不产生候选清单，只对 scholar 自己列出的 venues 填多轴事实表（scope 宣告、turnaround、OA 政策、字数限制、AI disclosure 政策——最后这项 ARS 的 venue_disclosure_policies 已有种子）。「帮我找适合的期刊」这个原始需求本身做不了（候选建构=隐性排名），能做的是「我在这四本之间犹豫」的事实比较器。价值缩水后还值不值得，送裁；优先级低于 F-1/F-2/F-5。

### 5.4 F-7 发表后段【增补，要求扩 POSITIONING scope，措辞修正】

初稿写「citation tracking、errata、OA self-archiving 全空白」。**codex 修正：monitoring_agent 不是空白**——retraction/correction alert（含对自己研究的 impact assessment）、contradictory findings 侦测、author tracking、citation alert 设定指南都在，定位是 optional 的 post-research advisory。

准确的残余 gap 三项（皆是「对自己论文」的视角，monitoring_agent 是「对引用的别人论文」的视角）：①**自我 citation-context audit**：谁引用了我、把我的 claim 引成什么样——技术上是 L3 claim-faithfulness 的镜像（同一套 anchor/judge 机制反向用），gemini 也独立指出「总结 verifiable post-publication metrics 供机构 review 用」是不违反 Paper2X 的正当行政用途；②**自我 errata workflow**：发表后发现错误的更正流程支援；③**OA self-archiving 合规**：Sherpa Romeo 查询、postprint 版本管理。

**此提案要求修改 POSITIONING 的 scope 叙述**（"research-to-publication"——publication 是终点站）。若裁定不扩，建议至少把「发表后是 deliberate non-goal」写进 POSITIONING，理由同 F-1：留白与五条 Rejected mechanisms 的记录纪律不对等。

### 5.5 F-13 grant/funding lifecycle【增补，scope 裁定；gemini 补抓】

本盘点初稿的生命周期走查从 RQ 孵化起跳，**整段漏掉 grant/计划申请**——gemini 点出这是资深研究者实际行政负担的大宗，且是 research program 的真正起点（先有计划核定才有研究线）。repo 现况：funding_statement_guide 只处理「论文里的 funding 声明」，计划书写作（研究目的、文献、方法、预期成果、预算叙述）零支援。

对使用者画像（国科会申请）这是真实年度事件。但本盘点对它的立场有保留，跟 §9 的警告同源：**计划书的「预期影响/预期成果」段是 impact-washing 的最高危文类**（承诺未发生的事），ARS 若进这个文类，最自然的滑坡就是「把预期影响写到无懈可击」。可辩护的切法：grant 的文献段与方法段跟 ARS 现有能力（lit-review、research_architect）高度重叠，重用即可；预期成果段只做 advisory 探问不做生成。是否值得为此开 grant-mode（vs 使用者自己拿现有 modes 拼装），送裁。我的倾向：**不开专属 mode**，在 docs 补一页「用现有 modes 写计划书的组装指南」即可，把生成式支援明文排除。

---

## 6. 使用者画像对位

### 6.1 F-10 中文线：比 SKILL.md 表面深，但止于排版【增补】

比预期好的部分（agent prompt 层实查）：literature_strategist 有 TSSCI/Airiti/台湾硕博士论文网检索策略；apa7_chinese_citation_guide 有 TSSCI 期刊引用专节；formatter 有 xeCJK + TSSCI 期刊格式路由；pipeline Stage 5 指定 Source Han Serif TC。中文研究的「找文献→写→排版」链是通的。

缺的部分：①中文审查惯例——reviewer 5 persona 与 rubric 全以国际英文期刊为框架，台湾学报审查文化无对应；②TSSCI 投稿 workflow 无；③术语强制英文（"Academic terminology is kept in English"）对纯中文社科论文是反向摩擦——台湾教育学界多数场合要求中文术语为主、英文夹注，现行规则方向相反。

裁定问题：投入量取决于你未来两年的 TSSCI 投稿篇数，这是只有你知道的事实。若投，①③是写作期就会痛的；②可以人肉。

### 6.2 F-3 灰色文献：citation gate 对政策研究系统性低覆盖【盲点】

四索引（S2 / OpenAlex / Crossref / arXiv）对政策研究的核心证据型态——政府报告、评鉴手册、白皮书、法规、无 DOI 的国际组织文件——覆盖率系统性偏低（初稿「全部查无」过度：部分 OECD/UNESCO 出版品有 DOI 可解析；codex 修正，gemini 对本条整体判 "factual and accurately assessed"）。C-V6 的精度优先设计（title-only unmatched → `unresolvable`，不 block）让这些引用不被误杀，这是对的；但后果是政策研究的 bibliography 大量落在 `unresolvable`，deterministic gate 的有效覆盖率对这类研究大幅下降。**旗舰防线在维护者本人的研究类型上效力最低。**#250（gold set 缺 real-but-unindexed tuples）是同一个洞的工程面，本条是产品面：#250 说「量不到」，本条说「防不到」。

增补方向（成本递增）：①`obtained_via: manual` 的灰色文献 entry 加 structured provenance（URL + accessed_date + archive snapshot），manual 路线从「豁免」升级成「另一种可验」；②URL 活性 + Wayback snapshot 存在性的 deterministic 检查（script 层、无 LLM）；③接政府出版品 API（每辖区不同，维护地狱）。我的判断：①②值得，③不值得。

---

## 7. 维护者品质 vs 使用者门槛

### 7.1 F-8 Opt-in 文化的暗面【盲点】

说公道话：49 条 lint、191 个 script、INV-* 全跑在 CI/maintainer 层，end user 零阻力。「lint 多 = 门槛高」不成立。

真正的门槛（数字经主 context 自查修正，codex 同向确认；gemini 在此条接受了未验证的初稿数字，是 gemini 本轮唯一的 fact-check 失手，分歧记录于 §11）：

1. **Flag 文件碎片化**：user-facing runtime flag 共 7 个，SETUP.md env 表列 5 个；`ARS_CLAIM_AUDIT`（claim audit 总开关）散在 README 行文三处、不在任何总表；`ARS_CACHE_DIR` 只在 design spec。问题本质不是数量是**没有单一 flag 总表**。
2. **安全功能全部 opt-in 预设关**：strict citation policy、claim audit（default OFF）、cross-model verification。新研究者照 QUICKSTART 三步装完，拿到 advisory 后缀（detection unconditional，标记会出现，这点诚实），但**没有任何 block**。v2.7 那次 31% 引用错误率换来的 deterministic gate，预设不挡任何东西。Backward-compat 纪律（byte-equivalent 升级）与安全预设在此对撞，目前一律牺牲后者。
3. **配置疲劳**：paper full Phase 0 九项访谈；SETUP.md 408 行、5 种安装法；新手路径与 power-user 全貌之间无中间阶梯。

增补形状：①`ARS_PROFILE=strict|standard|minimal` 一键 profile（已确认 repo 无此名）；②单一 flag 总表进 SETUP.md（纯文件工）；③裁定问题：新 user 预设要不要 citation_existence=strict？打破 byte-equivalent 惯例的取舍，只有你能裁。

### 7.2 F-9 Dogfooding 半断流【盲点，时间线经 codex 修正】

初稿宣称「v3.4 之后演进全为外部论文驱动、真实使用零痕迹」。**codex 打掉**：v3.6.7（04-30）的 spec 明写源自 "v3.6.5/v3.6.6 production academic chapter run" 的 17 个 drift patterns——这正是 chapter 真实使用的 repo 痕迹（也吻合维护者 memory 中的 Springer chapter 时段）；v3.9.4.1 等版本是 codex post-ship 修正非论文驱动。

修正后仍成立的事实：①唯一完整 end-to-end worked example（showcase/）停在 v2.7 时代（2026-03-09），其后 **9 个 minor 版的新机制（triangulation、terminal policy、claim audit、Kong track、experiment provenance）没有任何一个出现在完整真实 run 的 artifacts 里**；②v3.8 之后（05-16 起）的 motivation 全是外部论文（Zhao/Co-Scientist/Kong/Kim）；③eval gold sets 几乎全合成（citation_extraction 51 tuples 是 fabricated DOI，#250 自知；surface_form_parity 7 项中 3 项 maintainer 自写）。

论文驱动买到结构化 threat model（可审计、可 lint 化），但量测的是「合成威胁下的防线」不是「真实使用中的价值」。风险走向：工具变成失败模式文献的博物馆，而不是自己写论文时痛处的解药。

增补形状（成本近零，改惯例不改程式）：①下一篇真论文走一次 full pipeline，产出第二个 showcase；考虑立「每 minor 至少一次 real-run smoke」的 release 惯例；②CHANGELOG 加 `Real-use findings` 惯例节，让 lived experience 在 repo 留痕（v3.6.7 的 chapter-run 来源写在 spec 内文深处，初稿盘点都没挖到——这正说明回流痕迹需要一个固定位置）。

---

## 8. 诚实的 non-goal 清单

| 项目 | 为什么不做 | 状态 |
|---|---|---|
| 实验执行/autonomous coding | Kong §3.3 rejected；scholar 跑、ARS 验 provenance | 已拍板，维持 |
| Idea generation（RQ 提案/排序/改写） | Kong L2，cognitive ownership 论证坚实。本盘点所有 RQ 期提案都设计成问不给；F-1 经 codex 收紧为三条件 | 已拍板，维持 |
| Paper2X auto-generation（含 plain-language summary 自动转制） | POSITIONING rejected。**评估后不提案松动**：scholar-led 变体理论上可分，但它是 impact-washing 高危文类（S0 镜像），dissemination design 已划给 repo 外。不为它松动干净的红线 | 维持 |
| Authenticated crawl / paywall bypass | 2026-04-22 拍板，集体风险论证 | 维持 |
| Data layer（外部 corpus 整合） | Passport 是唯一 input port。F-1 的 ledger 是 ARS 自产 artifacts 承接，我判断不在射程内，边界送裁 | 维持（F-1 边界送裁） |
| Primary data 统计分析 | experiment-agent 领地 | 维持 |
| Multi-author 协作 | 修正：team_collaboration_protocol.md 已有 human-convention 层（roles/handoffs/approval 规则）+ intake 收 co-author data；零的是 passport 层 multi-author state（permissions、merge、co-author 确认）。**维持 non-goal**（单人工具的复杂度红利就在单人），protocol 文件已足 | 维持，无需动作 |
| Grant 预期成果段的生成式支援 | F-13 评估后明文排除（impact-washing 最高危文类）；文献/方法段重用现有 modes | 新增，建议记录 |
| 发表后段、research program 层 | 若 F-7/F-1 裁定不做 → 写进 POSITIONING non-goal，消除留白 | 待裁 |

---

## 9. 对 AACSB 报告的立场（含对使用者的挑战）

**同意且已转化为提案的**：impact-by-design——但 dual-track 证明 ARS 的 RQ 期已经做了（F-4 撤回是好消息：理念已内建），残余只在写作期延伸（F-2 形状 1）；spiral model 的跨轮回路（F-1 的扩 scope 理由）；external engagement 视角（F-2 形状 3）。

**挑战报告本身的**：①它是学校层级 advocacy 文件，分析单位是 institution（p.10 明说 impact 不该落在个别 faculty 肩上），直接搬到单人 copilot 是 category error，本盘点只取「个人研究线」中间层；②它引了 Campbell's Law（p.19 n.15）却对自家 Assessment Tool 毫无防 gaming 设计——一张自填 narrative worksheet，正是「把 impact 叙事写到无懈可击」的邀请函。

**挑战使用者的（真反驳，不是迂回同意）**：你同意 "research that reaches"，但你的机构角色和 S0 洞见都在告诉你 reach 的叙事面有多容易造假。这份报告若被工具化，最自然的产品化路径就是「impact statement writer」——而那正是你在评鉴端要抓的东西。本盘点刻意把 reach 的接入点全部放在源头（RQ 期，已存在）与事实层（citation-context audit、scholar-supplied 对照集），一个都不放在叙事层；F-13 的 grant 预期成果段同理排除。gemini 对这个 refusal 的评语是 "exceptionally well-argued" 但提醒「汇整 verifiable 既成 metrics 供机构表单」是正当用途——我接受这个区分：**回顾既成事实可以，前瞻承诺不行**。如果你不同意这个切法，分歧值得开 issue 吵。

---

## 10. 只有使用者能裁的判断（按优先序）

1. **F-1 research-line ledger**：①算不算 data layer 禁令射程（我判断不算）；②要不要开设计线（最小切片：scholar-initiated limitations surface + 自我 claim audit）；③不做的话要不要写进 POSITIONING non-goal。
2. **F-7 发表后段要不要进 scope**：动 POSITIONING 的 identity 级决定。不做也请写下 non-goal，消除留白。
3. **F-8 新 user 预设要不要 strict**：打破 byte-equivalent 惯例的取舍。
4. **F-2 做哪个形状**：推荐先做形状 1（socratic Layer 5 问句移植进 plan/revision coaching，最便宜）；形状 2 重设计后价值缩水，可不做；形状 3 便宜但价值虚。
5. **F-13 grant 段**：开组装指南页（我的倾向）还是完全不碰。
6. **F-10 中文线投入量**：取决于你的 TSSCI 投稿计划。
7. **F-5/F-9/F-14**：低争议（deterministic 化方向、real-run 惯例、rubric 权重 hygiene），可直接转 scoped issues。

---

## 11. Dual-track 纪录（codex 0.137 high-reasoning + gemini-3.1-pro-preview，2026-06-10）

**两模型独立收敛的（最高可信）**：①F-4 前提错误（两边都引 socratic_mentor_agent Layer 1/5 原文）；②「advisory ≠ 自动红线安全，候选集建构本身是 ranking」（codex 打 F-2 形状 2、gemini 打 F-6，不同条目同一原则）。

**codex 独有的真 catch**：F-9 时间线（v3.6.7 chapter-run 证据）、F-5 低估（formatter checklist 原文）、F-7 过度宣称（monitoring_agent 原文）、F-1 分类与 L2 三条件、F-14 rubric 不一致、F-3 措辞软化。本轮 codex 表现显著优于 gemini（11 条中 9 条成立）。

**gemini 独有的真 catch**：F-13 grant lifecycle 整段遗漏（codex 没抓到）；「回顾既成 metrics vs 前瞻承诺」的正当用途区分。

**分歧点（cross-model 的真学习）**：F-8 数字——codex 判 factual error（与主 context 自查一致），gemini 判 factual（接受了未验证的 14/9 数字）。同一条宣称、两个 verdict，谁做了 first-party grep 谁就对。又一次印证 [[feedback_ai_only_chains_fail_at_fluent_wrongness]]：cross-model 不是保险，first-party deterministic 验证才是。

**初稿五个被打掉/修正的宣称全数源自同一根因**：subagent 地图读到 SKILL.md/README 层、没读 agent prompt 层（formatter/socratic_mentor/monitoring 的细节全在 agent .md 内文），主 context 又对自写提案 anchoring。教训：**对 prompt-架构 repo 做产品盘点，「功能存不存在」必须查到 agent prompt 层才算数**。

---

## 12. 裁定结果（2026-06-10，使用者拍板）

| Finding | 裁定 | 落点 |
|---|---|---|
| F-1 跨篇记忆 | **B：不做机制，出文件**。使用者问「靠 扩展智能体运行环境 memory 行不行」→ 答：个人层可（重喂 passport + assistant memory 提醒），产品层不可（public skill 不能依赖使用者环境；ARS anti-leakage 哲学本来就不信 LLM 记忆；passport 是唯一 state of record） | **#397**（POSITIONING non-goal + cross-paper workflow guide） |
| F-2 平庸可见性 | 做形状 1（Layer 5 问句移植进 plan/revision coaching）；形状 2/3 不做 | **#393**（p1） |
| F-3 灰色文献 | 本轮未单独立案（①manual provenance 强化可并入未来 citation-gate 线） | 报告留档 |
| F-5 投稿包 | 做，design-first | **#394** |
| F-7 发表后 | **不做**：「使用者自己会查，战线不宜拉过长」→ 写成 recorded non-goal | **#397** |
| F-8 引用防线预设 | **预设不动，加配置访谈提问让使用者选** | **#392** |
| F-9 real-run 惯例 | 做 | **#395** |
| F-10 TSSCI / F-13 计划书 | **不做**：「给国际通用的 skill，用现有功能就好」 | 结案，报告留档 |
| F-14 rubric 权重 | 修 | **#396** |

---

## 附录：方法与证据

- 锚点文本全读：POSITIONING.md（Rejected mechanisms 五条）、Kong L1/L2 design lessons（state-authority + verb test）、Co-Scientist L1（hidden ranking）、README、docs/PERFORMANCE.md、MODE_REGISTRY.md、data layer boundary memory（2026-04-22）。
- AACSB *A Framework for Research Impact*（May 2026）46 页全读：spiral model（App. B）、Assessment Tool（pp.20-23）、impact indicators（App. D）、Campbell's Law 自引（p.19 n.15）。
- 两路 subagent 事实提取（SKILL.md 六轴地图 + repo 八点扫描）→ 主 context 自查修正 3 处 → codex + gemini dual-track → 本版修订 9 处。
- 本报告不动工程线：#330/#272/#250/#219/#89/#387 各有归属。
