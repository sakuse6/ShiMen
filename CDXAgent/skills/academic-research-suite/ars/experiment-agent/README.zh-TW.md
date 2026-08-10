# 实验代理人 (Experiment Agent)

[![Version](https://img.shields.io/badge/version-1.0-blue)](https://github.com/Imbad0202/experiment-agent/releases)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/license-CC%20BY--NC%204.0-lightgrey)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Sponsor](https://img.shields.io/badge/sponsor-Buy%20Me%20a%20Coffee-orange?logo=buy-me-a-coffee)](https://buymeacoffee.com/crucify020v)

扩展智能体运行环境 技能：执行、监控、解读、验证学术研究实验。

## 功能

- **执行程式码实验** — 执行脚本（Python、R 等），即时监控 stall/crash，收集结果
- **管理人工研究** — 规划 protocol、检查 IRB 伦理、追踪资料收集进度
- **统计解读** — 解读 p-value、效果量、信赖区间；检查 11 种统计谬误（Simpson's Paradox、存活者偏误等）
- **验证重现性** — 重新执行实验并比对结果

## 为什么需要

Lu et al.（2026, *Nature*）展示了自主 AI 研究的实验进度管理器。本技能将同样的执行与监控能力带入人类参与的学术工作流程——不承担全自动化的风险。

## 模式

| 模式 | 功能 |
|------|------|
| `run` | 执行程式码 + 监控 process |
| `manage` | 规划 + 追踪人工研究 |
| `validate` | 统计解读 + 重现性验证 |
| `plan` | Socratic 对话设计实验 |

## 快速开始

1. Clone 本 repo 到你的专案或 `.claude/skills/`
2. 启动 扩展智能体运行环境 session
3. 试试：「跑我的分析：`Rscript analysis.R`」

## ARS 相容性

本技能可独立使用，也可选择性整合 [Academic Research Skills (ARS)](https://github.com/Imbad0202/academic-research-skills)：

- 读取 ARS Stage 1 输出（RQ Brief、Methodology Blueprint）预填实验设计
- 产出符合 Material Passport、且明确标示 verification status 的输出供 ARS Stage 2 使用
- ARS 不需要任何修改——使用者手动衔接

### 何时搭配 ARS 使用

在 ARS pipeline 中，experiment-agent 介于 **Stage 1（研究）和 Stage 2（写作）之间**：

```
ARS Stage 1 研究      →  取得 RQ Brief + Methodology Blueprint
        ↓
  [暂停 ARS pipeline]
        ↓
  experiment-agent     →  plan → run/manage → validate → 取得分析或验证过的结果
        ↓
  [继续 ARS pipeline]
        ↓
ARS Stage 2 写作      →  用实验结果撰写论文
```

当你的研究需要跑实验（程式码或人工研究）才能开始写作时，使用 experiment-agent。如果论文纯粹基于文献回顾或二次资料分析，不需要这个工具，直接从 ARS Stage 1 进入 Stage 2。

### 如何载入

**步骤 1**：Clone 本 repo 到 ARS 专案旁（或任何位置）：

```bash
cd ~/Projects/HEEACT
git clone https://github.com/Imbad0202/experiment-agent.git
```

**步骤 2**：需要跑实验时，在 experiment-agent 目录开启 扩展智能体运行环境 session：

```bash
cd ~/Projects/HEEACT/experiment-agent
claude
```

**步骤 3**：将 ARS Stage 1 的相关输出（RQ Brief、Methodology Blueprint）贴入 session。Agent 会自动侦测 ARS 标题并预填实验计划。

**步骤 4**：实验完成并验证后，将输出（含 Material Passport header 与 verification status）复制回 ARS session，继续 Stage 2。

> 也可以透过 `.claude/skills/` symlink 将本技能加入任何专案。

## 安全机制

- 只执行你指定的命令——从不自动生成或修改你的程式码
- 从不自动重试 crash 的实验
- 从不接触原始参与者资料
- 统计解读是描述性的，不代替你下结论
- 完整清单见 SKILL.md 安全规则

## 授权

CC-BY-NC 4.0

## 作者

吴承翊 (Cheng-I Wu)

---

## 变更纪录

见 [CHANGELOG.md](CHANGELOG.md)
