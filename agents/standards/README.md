# Standards

This directory contains shared standards, guidelines, and procedures that agents follow.

Each agent's `AGENTS.md` references the standards that apply to their role. Standards are composable — a standard can reference other standards, building a chain of guidelines.

## Structure

```
standards/
├── README.md              # This file
├── general.md             # Universal rules all agents must follow
├── summaries.md           # How to write issue summaries
├── communication.md       # Comment style, status updates, handoffs
├── code/                  # Engineering-specific standards
│   ├── reviews.md         # Code review process
│   ├── testing.md         # Testing requirements
│   └── architecture.md    # Architecture decision records
├── sales/                 # Sales-specific standards
│   └── outreach.md        # Outreach and follow-up standards
└── management/            # Leadership-specific standards
    └── delegation.md      # How to delegate, create subtasks
```

## How to add a new standard

1. Create a `.md` file in the appropriate subdirectory (or create a new one).
2. Reference it from the relevant agents' `AGENTS.md` files under the "Standards" section.
3. Standards can cross-reference each other using relative paths: `See also: ../general.md`

## How agents use standards

Each agent reads their `AGENTS.md` on every heartbeat. That file lists which standards apply to them. The agent reads and follows each referenced standard file.

Different agents can follow different combinations of standards. A sales agent might follow `general.md` + `communication.md` + `sales/outreach.md`, while an engineer follows `general.md` + `summaries.md` + `code/reviews.md`.
