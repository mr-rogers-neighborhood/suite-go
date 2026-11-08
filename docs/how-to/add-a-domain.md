# Adding a domain

How little the container needs to change, which is the point of the contract.

## What a module is

A package that depends on `@suite/go`, exports one `SuiteGoModule` declaration, and owns everything
about its own domain: its schema, its file extension, its views, its capture behaviour.

## The steps

1. **Write the declaration.** An id, a name, an icon key, the capabilities it claims, the capture kinds
   it accepts. Nothing in it may describe the domain's data.

2. **Implement `register(host)`.** Return a `view` that renders the domain's own screen stack inside
   the frame the container provides, plus a `capture` handler if you claimed `capture`, plus a
   `dispose` that actually releases what it took.

3. **Use `host.documents` and nothing else for persistence.** Save bytes and a title; read back bytes.
   If the module needs the shape of its own document, that shape lives in the module — the same split
   `@suite/files` uses for envelopes.

4. **Register it in the shell.** One line in `apps/go/src/shell/App.tsx`. If registering it needed a
   second line, the contract is wrong; say so before writing the second line.

## What not to do

| Don't                                        | Because                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Let the container import the module's schema | The container would have learned a domain                                     |
| Put a colour or spacing value in the module  | Theme is resolved once at the root; a module reads variables                  |
| Assume another module is installed           | The container reports what is registered, not what exists in a catalogue      |
| Assume a network                             | v0 has no transport, and the target device can revoke network access entirely |
| Do work in the declaration                   | It is evaluated at startup; only `register` runs on open                      |

## The test that matters

Mount the module, open a document, leave, and return. Then assert that nothing from the first visit is
still listening. That is the teardown proof, and it is the reason the reference module exists.
