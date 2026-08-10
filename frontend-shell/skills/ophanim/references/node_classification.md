# Node Classification

Classify each message by role first, then by structure.

## Role Labels

- `user_decision`: The user approves, rejects, selects, or changes direction.
- `user_reaction`: The user acknowledges, reacts emotionally, or gives feedback without changing the plan.
- `user_action`: The user asks for an action, provides data, or gives an executable instruction.
- `assistant_decision`: The assistant chooses a path, confirms scope, or sets a constraint.
- `assistant_action`: The assistant performs or proposes a concrete step.
- `constraint`: A hard requirement, limit, or scope rule.
- `question`: A request for missing information.
- `unknown`: The message is too unclear to classify safely.

## Structure Labels

- `process`: Ordered steps, procedures, or staged work.
- `decision`: A choice point that selects a path or resolves a question.
- `branch`: The resulting alternative path after a decision.
- `loop`: Repetition, retry, refinement, or revisit.
- `reaction`: Feedback without a structural change.
- `question`: A missing-input gate.
- `constraint`: A rule or limit that constrains the path.
- `unknown`: Structure is not safe to infer.

## Precedence

1. Detect hard constraints first.
2. Detect explicit questions next.
3. Detect loop signals next.
4. Detect decision or branch signals next.
5. Detect ordered process signals next.
6. Detect reactions last.
7. If nothing is safe, use `unknown`.

## Decision Tree

1. If the message states a limit or requirement, classify the structure as `constraint`.
2. If it asks for missing information, classify the structure as `question`.
3. If it repeats, retries, revisits, or iterates, classify the structure as `loop`.
4. If it chooses, approves, rejects, or splits paths, classify the structure as `decision` or `branch`.
5. If it lays out ordered steps, classify the structure as `process`.
6. If it only acknowledges or responds emotionally, classify the structure as `reaction`.
7. If none of the above is safe, classify the structure as `unknown`.

## Edge Rules

- Treat short confirmations like `yes`, `ok`, `can do`, or `sounds good` as `user_decision` when they clearly answer a prior request.
- Treat `got it`, `understood`, or `received` as `user_reaction` unless they also approve or reject something.
- Treat `if ... then ...` as a decision gate plus a branch when both sides are present.
- Treat `try again`, `start over`, `continue`, `go back`, and `repeat` as loop signals.
- Treat `first ... then ...` as a process only when the message is sequential and does not change the path.
- Split a mixed message only when two roles are clearly independent; otherwise use the dominant role and note the secondary signal.

## Output Hint

Keep the label stable across reruns. If a message can be read two ways, prefer the safer, less committal label. When in doubt between `process` and `decision`, prefer `process` unless the message explicitly selects a path.
