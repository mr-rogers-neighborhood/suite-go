# The pairing handshake, as a session type

What happens when a second device is brought into a workspace by scanning a code, stated precisely enough to
implement and to test. Written because the previous description of this protocol was a linear-logic formula
that read as rigour and established nothing.

This is a **design note**, not an implementation plan. It describes the exchange and names three properties
that must hold. The tests that prove them are listed at the end and are the part that matters.

## Why the old formula did not hold

The formula was:

```text
!Root ⊗ PairSession ⊗ Challenge(n) ⊸ (AppKey_A ⊗ Receipt(A, D))
```

Four problems, recorded so they are not re-invented:

1. **`⊗` is commutative, so it cannot express order.** A handshake is _offer, then challenge, then response,
   then key_. `Root ⊗ PairSession ⊗ Challenge(n) ⊸ AppKey` is satisfied by any derivation holding all three —
   including one where the challenge was minted before the session existed. The formula is a conjunction
   where a sequence belongs.
2. **Linearity is not freshness, so it cannot express replay resistance.** Linearity constrains use _within
   one derivation_; replay is the same message appearing in a _different_ derivation. A calculus with no
   notion of runs over time cannot distinguish a nonce from a second ago from one captured last week, so
   "prevents replay" was not a property it could establish.
3. **"The app key is not derivable from the root" is a cryptographic claim.** Infeasibility is not a typing
   judgement. A type discipline can say "this value must not be duplicated"; it cannot say "an adversary
   cannot compute this".
4. **`Receipt(A, D)` has no state, so it cannot model revocation.** Revocation here is "the epoch advanced,
   so earlier frames are unreadable to the removed leaf" — a property of a versioned resource, not of a
   consumed fact.

One thing the formula got right, and this document keeps: **`!Root`**. A reusable authority plus a
single-use session is the correct decomposition. The error was in what the arrow was built from.

## The exchange

Notation: `?T` receives a value of type `T`; `!T` sends one; `.` is "then"; the whole thing is the type of a
**linear channel**, so exactly one session may run on it.

```text
Pair ≡ ?Offer(x25519_pk, relay_url, invite_id)
     . !Challenge(nonce)                       -- 32 random bytes, remembered until answered
     . ?Response(ed25519_pk, sig_pair_nonce, sig_cancel_nonce)
     . ( !Sealed(vault) ⊕ !Cancelled )          -- the person may refuse
```

### Who does what

| Step | Device A (has the workspace)                                                                                 | Device B (joining)                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Displays a code carrying an ephemeral X25519 public key, the relay address and the invite id. Nothing secret | Scans it                                                                                                                                     |
| 2    | Computes `k = HKDF(ECDH(a_eph, B_eph))`                                                                      | Generates `b_eph`, computes `k = HKDF(ECDH(b_eph, A_eph))`                                                                                   |
| 3    | Shows a six-word digest of `k` **on its own screen**, so the person can compare                              | Shows the same digest; the person confirms they match                                                                                        |
| 4    | Sends `Challenge(nonce)` sealed under `k`                                                                    | Receives it                                                                                                                                  |
| 5    | —                                                                                                            | Sends its Ed25519 identity key and a signature over `(nonce, both ephemeral keys, "pair")`, plus a second signature over `(nonce, "cancel")` |
| 6    | Verifies, then seals `vault` to B and sends it                                                               | Opens it, writes identity and group state, confirms                                                                                          |

### Why each field exists

| Field                                                 | Reason                                                                                                                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nonce, 32 random bytes, remembered until answered** | The only thing that makes the response non-replayable. It is state, not a type. It is discarded after one use, and a session with no pending nonce accepts nothing                                              |
| **Both ephemeral keys inside the signed bytes**       | Otherwise a relay can splice one half of a session onto another; this is the classic unknown-key-share failure                                                                                                  |
| **Two signatures, "pair" and "cancel"**               | A refusal must be as authenticated as an acceptance, or a hostile relay can turn a decline into silence — or a silence into an accept                                                                           |
| **Six-word digest on both screens**                   | Detects a relay that substitutes its own ephemeral key. Without it, a man in the middle is undetectable by the two devices; with it, the person is the check                                                    |
| **`vault`**                                           | The existing recovery-kit payload: device signing identity plus MLS group state. **Not** a new key hierarchy — there is no root key in this system, and inventing one would be a second way to lose a workspace |
| **`⊕ !Cancelled`**                                    | Refusal is a first-class outcome. A person who scans the wrong code must be able to say no, and the other device must learn it happened                                                                         |

### What this deliberately does not do

- **No root authorizer, no app keys, no key derivation from a long-lived secret.** The vault _is_ the key
  material, which is what canvas ADR-0097 already says ("whoever holds the file _is_ this device"). A
  pairing protocol does not change that; it moves the file.
- **No offline re-derivation.** Nothing about the exchange permits a peer to compute a key it was not given.
  That is true because the key is never derived from anything shared — not because a calculus says so.
- **No key rotation on pairing.** Adding a device is an MLS Add, which is a new epoch. Pairing transports
  state; it does not make new group members.

## The three properties, and where they are checked

These are the statements the old formula gestured at. Each is written so that a test can fail.

| #   | Property                                                                                                    | How it is established                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Secrecy** — the vault is readable only by the device whose ephemeral key was in the offer                 | The vault is sealed under `k`, and `k` requires the private halves of both ephemeral keys. Test: a third device that saw the whole transcript cannot open it                                                                                   |
| P2  | **Injective agreement (anti-replay)** — every accepted vault corresponds to a _distinct_ prior session      | The nonce is retained until answered and then discarded; a response naming an unknown or already-used nonce is refused. **Test:** replaying a captured response is rejected, and the second attempt is refused rather than silently succeeding |
| P3  | **Correspondence** — a vault is released only after a response signed by the identity in the offer's invite | The signature covers both ephemerals and the nonce. Test: a response signed by a different key, or over a different nonce, is refused before the vault is sealed                                                                               |

If these are ever worth proving rather than testing, the tool is a symbolic protocol verifier (ProVerif,
Tamarin, CPSA), because all three are queries over runs — secrecy, and injective correspondence — and that is
precisely what such a verifier answers. A type system would answer a different question.

## What this does not protect against

Honest limits, because a threat model that only lists wins is a brochure:

- **A compromised host at pairing time.** If the machine displaying the code is already running an
  attacker's code, it can show a digest that matches its own substituted key. The person's comparison only
  defends against a compromised _relay_.
- **A device that keeps the vault.** Pairing grants the joining device the same authority as the pairing
  device had. Removing it later is an MLS Remove; pairing cannot make it forget what it already read.
- **Screen capture, shoulder surfing, and a camera pointed at the code.** The code carries only public
  values, so this is survivable; the digest comparison is not, and that is a human problem.
- **No protection for the vault in transit beyond `k`.** If `k` never leaks and the digest matches, the
  exchange is sound. If the digest is skipped, everything downstream is a guess.

## Tests this note asks for

Three, in order of how much they would catch:

1. **Replay is refused.** Capture a valid `Response`, replay it after the vault was released; expect a
   refusal, not a second vault.
2. **A wrong-key response is refused before the vault moves.** Sign with a different Ed25519 key; assert the
   vault was never sealed (an assertion on _ordering_, not just on the outcome).
3. **The vault does not open for a third party.** Give a third identity the full transcript; assert it
   cannot decrypt, and that it fails rather than returning garbage that a caller might commit.

The first is the one the old formula claimed and could not express. It is also the cheapest.
