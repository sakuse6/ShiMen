# Error Cases

Use these as negative checks before you render the final mind map.

## Common Mistakes

- Do not treat a neutral acknowledgement as consent.
- Do not infer a hidden decision when the user only repeats the request.
- Do not merge the assistant's plan with the user's intent.
- Do not cross the last Ophanim snapshot marker.
- Do not invent missing turns, hidden motives, or unstated constraints.
- Do not collapse two distinct user decisions into one node.
- Do not output a summary that is broader than the computed transcript slice.
- Do not skip fingerprinting after the node text is finalized.
- Do not label a branch gate as a plain process step.
- Do not collapse a retry loop into a one-off action.
- Do not split a simple sequential instruction into fake branches.

## Representative Failures

- User says `understood` after you explain the plan: label as `user_reaction`, not `user_decision`, unless the user also approves the plan.
- User says `let's do that`: label as `user_decision`.
- User edits scope with `do A first, B later`: split into one decision plus one constraint if the structure is explicit.
- Assistant says `I will check the boundary first`: label as `assistant_action`, not `assistant_decision`.
- A message only says `ok, thanks`: label as `user_reaction`.
- A message says `if this fails, try again`: split into one branch gate and one loop signal only if the text actually revisits the step.

## Recovery Rule

If any classification is uncertain, write the conservative label and mark the node as `unknown` in the note field instead of forcing a precise interpretation.
