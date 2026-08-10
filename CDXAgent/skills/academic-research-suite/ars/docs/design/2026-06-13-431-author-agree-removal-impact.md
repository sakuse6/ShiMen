# ARS #431 — 「拿掉 strength-2 author-agree 单独 accept」连锁影响 + 可行性评估

**日期：** 2026-06-13
**目的：** 第四轮 codex re-verify 判定「三个结构 veto 是 whack-a-mole，真正缺陷是 strength-2 `author_state==agree` 单独能 accept 非 exact 标题」。拍板前先把连锁影响与可行性查实（回第一手程式码，非推测）。
**结论先讲：** 「更强 bibliographic 鉴别」在四 client 现况**不对称可得**，s2 甚至连 candidate metadata 都丢掉。所以干净的根治方案是 **A 案（exact-title-or-bust）**，不是 codex 建议的「venue+volume+issue+page 唯一化」（后者三家拿不到，会变成只有 crossref 能做的跛脚 gate）。recall 损失比想像小（见 §3）。

---

## 1. 真正的缺陷（第四轮确认，我复现成立）

strength-2 的这两条：
```
accept if author_state == agree                       # strength 2
accept if year_state == agree AND author_state == agree   # strength 2
```
让「**非 exact 标题 + 同作者 + 同年/不冲突 + ratio≥0.70**」单独过关。但这个特征正是**一个作者自己的关联著作群**的共同特征：
- correction ↔ original（P1-a，反向）
- reply/comment ↔ original（P1-c）
- Part I ↔ Part II（P1-d）
- **Study 1 ↔ Study 2 / First ↔ Second Report / Theory ↔ Experiments companion（第四轮新增，全 evade 我的三 veto）**

复现 ratio（本机 SequenceMatcher）：Study 1/2 = **0.975**、First/Second Report = 0.901、Theory/Experiments = 0.878、Authors' reply = 0.897。全 ≥0.70，全同作者同年，全 strength-2 accept → 误 `matched`。

用「同作者」当身分证据，对这整类**反向失效**：同作者是这些 distinct works 的共同点，不是区分点。再加 enumerated veto（study/report/experiment/...）永远补不完——这就是 whack-a-mole 的定义，已四轮实证。

## 2. 为何「补洞」路线必须放弃

我连续四轮都在加 veto / 加 denylist 条目，codex 每轮找到清单外的下一个：
- R1→v2：notice veto（单边）
- R2→v3：year-only 收紧
- R3→v4：notice 对称 + reply wrapper + designator veto + generic denylist
- **R4：Study/Report/companion evade designator；guest editorial evade denylist；我的 non- fold 反噬把 `Non-invasive` vs `Invasive` 真矛盾洗成 match**

最后一个尤其是教训：**我为了消假 veto（P2-e）动 negation 逻辑，反而引入新 false-positive**（[[feedback_simplify_reviewer_careful_removing_safety]] 活案例）。补洞路线不只补不完，还会自伤。

## 3. 根治方案的可行性 — candidate-side 到底拿得到什么鉴别证据？

codex 建议「require DOI/ID, venue+volume+issue+page/article-number」。**但这在四 client 不对称可得**（第一手读 code）：

| client | title_search return | candidate metadata resolver 拿得到 | volume/issue/page |
|---|---|---|---|
| crossref | `scored[0][0]` = 完整 Crossref work item | title/year/author（现抽）；**DOI/volume/issue/page/container 在 item 内、可加抽** | ✓ 可得（需加 `_extract`） |
| openalex | `scored[0][0]` = work dict | title/year/author/**DOI**/primary_location(venue)；select=`id,title,authorships,publication_year,doi,primary_location` | ✗ 没 select（要改 query） |
| arxiv | (待确认，XML entry) | title/year/author；arXiv **没有** volume/issue/page 概念（preprint） | ✗ 本质不存在 |
| **s2** | **`{"matched", "paperId"}`** — **candidate dict 丢掉** | **连 year/author 都拿不到**（loop 内有 `cand`，但 return 不带出） | ✗ 且要大改 return 型别 |

**关键事实：**
1. **s2 现在连 candidate 的 year/author 都没回给 resolver**（只回 matched+paperId）。spec §0.4 的 strength tiers 要在 s2 生效，本来就得先改 s2 的 return 把 candidate metadata 带出来——这笔改动 spec 已隐含要做。但要它再带 venue/volume 是更大改动。
2. **volume/issue/page 只有 crossref 拿得到**（且要加抽）。openalex 要改 query select、arxiv 本质没有、s2 要大改。所以「venue+volume+issue+page 唯一化」会变成**只有 crossref 能执行的 gate**，另三家照样只能靠 title+author+year → 跛脚，等于没根治。

**∴ codex 的 minimal fix（volume/issue/page 唯一化）在这个 4-client 拓朴下不可行为通用方案。** 真正通用、四家都能执行的根治只有一个共同点：**exact normalized title**（strength 3，四家都算得出 ratio==1.0 / normalized 相等）。

## 4. 两个可行的根治方向（都通用于四 client）

### A 案：exact-title-or-bust（纯收紧，最干净）
非 exact 标题的 title-fallback **一律不靠 author/year 单独 accept**——要 matched 必须 exact normalized title（strength 3），否则 `unresolvable`。
```
reject if ratio < 0.70
reject if year_state==conflict OR author_state==conflict
accept if exact_normalized_title AND NOT generic_title_collision_risk   # 见下
reject otherwise   # 非 exact 一律 unresolvable（含同作者同年）
```
- **消掉**：P1-a/c/d + 第四轮 Study/Report/companion **整类**（它们全是非 exact）→ 不需要 §0.3 item-4 三个结构 veto，**直接删掉那层**（简化，非加层）。
- **generic-title（P1-b）**：exact 但低资讯。改用「generic head 命中 → 即使 exact 也要 DOI/ID 命中才算，否则 unresolvable」。这对 generic 是对的（generic 连 exact 都不足以证身分）。
- **代价（recall）**：合法的「短名引用同作者真论文」非 exact 者 → unresolvable。**但这代价比想像小**，见 §5。
- notice/reply/designator veto **全部不需要**（非 exact 自动不过）→ 连同我写的 §0.11.1 整段可删。**Fix C（non- fold）也不需要**（negation veto 整个在非 exact 才有意义，但非 exact 反正 unresolvable）→ 反噬问题消失。

### B 案：保留 author-agree 但加「结构差异 = 降级」总则（仍有 whack-a-mole 残余）
保留 strength-2，但定义一个**通用** structural-delta 侦测（不是 enumerate 字词）：若两个非 exact 标题的 principal delta 是「**任何**位置的数字/序数/timepoint token 差异」或「一侧是另一侧的 wrapper」，则 author-agree 不足、要 exact 或 DOI。
- 比 A 案保留更多 recall（同作者非序号类关联著作仍可能 match）。
- **但**「principal delta 是序数/timepoint」这个侦测本身仍是启发式，codex 第五轮很可能再找到不靠序数的 companion（如 `: Theory` vs `: Experiments` 根本没数字）→ whack-a-mole 没真正结束。§3 的 Theory/Experiments 案例（0.878）就是 B 案也挡不干净的证据。

## 5. A 案的 recall 代价 — 实际多大？

关键问题：合法的「**非 exact** 标题 + 同作者真论文」在真实 citation 语料多常见？分三种：

1. **短名引用（BERT 类）**：cited=`BERT` vs indexed=`BERT: Pre-training of Deep Bidirectional Transformers`。这是 spec 行671 的正向验收案例。**但**——这类**几乎都有 arXiv ID 或 DOI**（BERT = arXiv:1810.04805）。title-fallback 只在 **ID 查找先 miss** 才触发。一篇有名到被短名引用的论文，ID 查找 miss 的机率低。所以「短名引用 + 无 ID + 靠 title-fallback」的交集，比「短名引用」本身小一个量级。
2. **标题轻微变体（标点/副标题差异）**：这些 normalized 后**常常就 exact 了**（normalization 已收标点/大小写）→ 走 strength-3，不受影响。
3. **真正非 exact 且无 ID 且同作者**：剩下的才是 A 案的损失。这类与「同作者关联相异著作」**在 title 层无法区分**（正是 §2 的根本困境）——所以把它们一起判 unresolvable，是 title-only fallback 层**本质做不到的区分**，unresolvable（safe direction）是诚实答案，不是过度保守。

**∴ A 案的真实 recall 损失 ≈「短名引用 ∩ 无 ID ∩ 非 exact」**，是个小交集；且损失全在 safe direction（unresolvable，非 false）。换来消灭整类 dangerous false-positive（同作者关联著作误并）。这个取舍对一个**引用真实性验证工具**是对的：它的核心承诺是「不把相异著作判为同一」，宁可 unresolvable 不可 false matched。

## 6. 我的建议

**A 案。** 理由：
1. 唯一**通用于四 client**的根治（exact-title 四家都算得出；volume/issue/page 只 crossref 有）。
2. **简化而非加层**：删掉 §0.11.1 三个结构 veto + Fix C，strength tier 变两条（exact-title / generic-needs-ID）。code 改动更小、更好验。
3. 消灭**整类** same-author related-work false-positive（含所有 codex 未枚举到的），不再 whack-a-mole。
4. recall 损失是小交集且 safe direction（§5）。
5. 符合工具核心承诺与 LLM-defect-class posture（mitigate by narrowing the claim，[[feedback_llm_defect_class_problems_may_have_no_current_fix]]）。

**代价要诚实写进 spec**：BERT 类短名引用若无 ID 且非 exact → unresolvable（recall 降，acknowledged，safe direction）。spec 行671 的正向验收案例要改述：BERT 短名**靠 ID 命中** matched（本来就该如此），不靠 title-fallback 的 author-agree。

**下一步**：A 案改完 spec（§0.12 v5，删 §0.11.1 + 改 §0.4 strength tier）→ 第五轮 codex re-verify（这次攻面小很多：只剩 exact-title strength-3 + generic-needs-ID 两条）→ 0 P1 进 code。

## 7. 若你选 B 案 / 撤退威胁本身
- **B 案**：我会定义通用 structural-delta 降级则，但**预告**第五轮 codex 很可能再破无序号 companion（§3 Theory/Experiments 已是证据），可能要再一轮。保留 recall 的代价是收敛更慢、残余风险高。
- **撤退威胁（记 known-limit）**：把「同作者同年关联著作」整类记为 title-only fallback 层不可靠区分的 known-limit。但这**不可接受地留 dangerous direction 开著**（distinct→matched），与工具核心承诺冲突——除非同时拿掉 author-agree 把 dangerous 部分挡掉（那其实就回到 A 案）。所以纯记 known-limit 不挡 dangerous 的版本我不建议。
