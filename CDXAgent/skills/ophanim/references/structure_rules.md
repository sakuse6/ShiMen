# Structure Rules

Use this file to decide whether a transcript segment is a process, decision, branch, or loop.

## Core Goal

Separate the transcript into atomic nodes that preserve:

- order
- choice points
- repeated work
- explicit constraints
- unanswered questions

## Structural Signals

### Process

Use `process` when the message advances work in order.

Typical signals:
- `first ... then ...`
- numbered steps
- `step`, `phase`, `stage`
- sequential instructions

### Decision

Use `decision` when the message selects a path or resolves a question.

Typical signals:
- `choose`
- `decide`
- `let's do this`
- `switch to`
- `do A first`
- approval or rejection

### Branch

Use `branch` for the resulting path after a decision.

Typical signals:
- `if ... then ...`
- `otherwise`
- `plan A / plan B`
- `yes / no`

### Loop

Use `loop` when the message repeats or revisits a prior step.

Typical signals:
- `try again`
- `start over`
- `continue`
- `go back`
- `repeat`
- `until`, `retry`, `iterate`

## Splitting Rules

Split a message into multiple nodes when:

1. It contains an ordered process plus a branch gate.
2. It contains a decision plus a repeated revisit.
3. It contains a loop plus a new decision.

Do not split just because a sentence has multiple clauses. Split only when the structure changes.

## Relation Labels

Use one of these labels between nodes:

- `next`
- `decision-to-branch`
- `branch-to-followup`
- `loop-back`
- `loop-exit`
- `constraint`
- `question`

## Conservative Rule

If the segment can be read as either process or decision, choose process unless the text explicitly selects a path.
If the segment can be read as either branch or reaction, choose reaction unless a path alternative is explicit.
