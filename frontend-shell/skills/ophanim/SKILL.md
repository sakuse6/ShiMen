---
name: ophanim
description: Deterministic conversation mind-map generation for bounded transcript segments, including process, decision, branch, and loop reconstruction with strict JSON-first validation and fingerprinted Markdown or Mermaid rendering. Use when the user asks for a strictly bounded recap, reaction or decision trace, or mind map of the dialogue since the last Ophanim snapshot or since conversation start.
---

# Ophanim

## Purpose

Use this skill to turn a bounded conversation segment into a precise mind map.

The output must be evidence-based, not speculative:
- Use only the transcript slice inside the current boundary window.
- Treat the last `### OPHANIM SNAPSHOT` marker as the previous cutoff.
- If no previous marker exists, start from the beginning of the conversation.
- If a detail is not stated, mark it as `unknown` instead of guessing.
- Preserve the original order of turns.
- Split a single turn when it contains a real procedural step plus a real decision or loop gate.
- Treat JSON as the source of truth and Markdown as a render target.

## Workflow

1. Find the slice boundaries first.
2. Classify each turn using `references/node_classification.md`.
3. Apply `references/structure_rules.md` to separate process, decision, and loop structure.
4. Build strict JSON using `assets/json_output.tmpl`.
5. Attach fingerprints with `scripts/fingerprint_generator.py` into each node's `codex.fingerprint`.
6. Validate the JSON with `scripts/output_validator.py`.
7. Render `assets/markdown_tree.tmpl` from the validated JSON only.
8. Optionally render `assets/mermaid_flow.tmpl` for a visual summary.

## Boundary Rules

- Use `scripts/boundary_finder.py` when you have a transcript export or message array.
- Search backward for the most recent `### OPHANIM SNAPSHOT` marker.
- Slice from the message after that marker through the current invocation message.
- If the marker is absent, use the full transcript.
- Never cross the computed boundary window.

## Classification Rules

Load `references/node_classification.md` before labeling content.
Load `references/structure_rules.md` before deciding whether a message is a process step, branch, or loop.

Preferred node types:
- `user_decision`
- `user_reaction`
- `user_action`
- `assistant_decision`
- `assistant_action`
- `constraint`
- `question`
- `unknown`

If a message contains multiple types, choose the strongest operative type and keep the other signal as a note.
If a message contains a process plus a gate, split it into separate nodes rather than forcing a single label.

## Structural Rules

Use these structure labels in the rendered tree:
- `process`
- `decision`
- `branch`
- `loop`
- `constraint`
- `question`
- `reaction`
- `unknown`

Rule of thumb:
- `process`: ordered steps that advance work.
- `decision`: a choice that selects a path or settles a question.
- `branch`: the resulting alternative path after a decision.
- `loop`: repetition, retry, refinement, or revisit.

If a node can be read as both process and decision, prefer splitting it into two nodes.
If a node signals repetition, create an explicit loop node and link it back to the earlier step it repeats.

## JSON Contract

Load `assets/json_output.tmpl` before producing the final result.

Required top-level keys:
- `meta`
- `nodes`

Required node keys:
- `id`
- `text`
- `codex`

Required `codex` keys:
- `role`
- `structure`
- `relation`
- `fingerprint`

Do not render Markdown before the JSON passes `scripts/output_validator.py`.

## Fingerprint Rules

Run `scripts/fingerprint_generator.py` on each node's rendered text.

- For normal-length text, use the first 5 and last 5 characters.
- For short text, keep the full text and mark it as a short-text fingerprint.
- Append the fingerprint to the same node line so the next run can verify it.
- Fingerprint only the final rendered node text, not the raw message.

## Rendering Rules

- Use `assets/markdown_tree.tmpl` as the canonical output skeleton.
- Keep the tree stable across runs so the same transcript yields the same shape.
- Use one line per node with explicit codex metadata markers.
- Preserve the validated `codex.role`, `codex.structure`, `codex.relation`, and `codex.fingerprint` values verbatim.
- Place the snapshot marker block at the end of the output.
- If Mermaid is helpful, use `assets/mermaid_flow.tmpl` with the same boundary data.

## Failure Policy

If the required transcript slice or message array is not available:
- State the limitation explicitly.
- Do not invent the missing messages.
- Do not fabricate a boundary.
- Ask for the transcript export or the surrounding conversation context.

## Resources

- `scripts/boundary_finder.py`
- `scripts/fingerprint_generator.py`
- `scripts/output_validator.py`
- `references/node_classification.md`
- `references/structure_rules.md`
- `references/error_cases.md`
- `assets/json_output.tmpl`
- `assets/markdown_tree.tmpl`
- `assets/mermaid_flow.tmpl`
