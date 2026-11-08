# Decision records

Each record states a decision, what it costs, and what would supersede it. They are written to be read
years later by someone who was not in the conversation, so each one links the code or measurement it
rests on rather than restating it.

Format, shared with the other repositories: `# ADR-00NN: Title`, then Status, Date, Context, Decision,
Consequences. A superseded record stays and gains a pointer; it is not deleted, because the reason a
decision was made is usually the part worth keeping.

| ADR                                              | Decision                                                 | Status   |
| ------------------------------------------------ | -------------------------------------------------------- | -------- |
| [0001](0001-packs-declare-capabilities.md)       | A pack declares its capabilities; the host enforces them | accepted |
| [0002](0002-isolation-is-a-document-boundary.md) | Isolation is a document boundary, not a sandbox          | accepted |
| [0003](0003-every-pack-carries-its-own-react.md) | Every pack carries its own React                         | accepted |
| [0004](0004-sync-is-an-event.md)                 | Sync is an event, not a state                            | accepted |
| [0005](0005-durability-boundaries.md)            | Flush on lifecycle boundaries                            | accepted |
| [0006](0006-the-doorbell-is-reserved.md)         | The doorbell is reserved, not built                      | accepted |
| [0007](0007-collaboration-is-a-session.md)       | Collaboration is a foreground session                    | accepted |

## Related, outside this directory

- [suite-sync ADR-0005](https://github.com/mr-rogers-neighborhood/suite-sync/blob/main/docs/decisions/0005-blind-server.md)
  — the relay is blind, which constrains what a doorbell can carry.
- [suite-sync ADR-0007](https://github.com/mr-rogers-neighborhood/suite-sync/blob/main/docs/decisions/0007-device-agnostic-relay.md)
  — the relay's host is any device, which is why mobile is a peer rather than a client.
- [blind doorbell proposal](../reference/blind-doorbell-proposal.md) — the protocol question, addressed to
  suite-sync rather than decided here.
