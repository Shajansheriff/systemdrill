---
title: "Payments / Wallet / Ledger Systems"
description: "Model money as auditable entries and treat uncertain external outcomes as first-class states."
order: 5
tags: ["Correctness", "Idempotency", "Ledger"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| One logical payment produces at most one intended charge. | Retries must not change the amount a customer pays. | New charge identity after a lost provider response. | Stable business attempt identity; provider idempotency; unique local constraints. |
| Posted money movements balance and remain auditable. | A balance number alone cannot explain where money went. | One account updates without its counterpart or history is overwritten. | Atomic balanced journal entries per currency; immutable postings and explicit reversals. |
| Spendable funds respect the overdraft policy. | Two simultaneous debits must not spend the same money twice. | Both read balance 100 and approve independent debits of 80. | Atomic balance predicate/locking with postings in the same transaction; holds for pending spending. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Unknown outcomes are eventually investigated. | Unresolved payments can leave customers charged and orders unpaid. | A timeout is marked failed and forgotten. | Durable attempt state, reconciliation, age-based alerts and controlled operator resolution. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`, storing one mutable balance per account.

```text
A reads wallet balance = 100.
B reads wallet balance = 100.
A approves debit 80; B approves debit 80.
Both write balance = 20 and both pay a merchant.
The database shows 20 although 160 was spent.
```

The balance reads did not reserve spending power. Protect the balance predicate and journal postings in one short transaction. A journal explains the transfer; locking or a conditional debit enforces the spending constraint. You need both.

Another window: provider charges → API crashes → retry creates a new charge. The external effect cannot be rolled back by the local database transaction. Persist identity before calling, keep UNKNOWN as a state, and reconcile using provider records.

## 3. Core Deep Dives

### Double-entry ledger

**Problem:** Explain every posted movement and derive balances.

**Naive approach and why it fails:** Update a balance and keep an optional log; crashes can separate them.

**Common solution:** Commit a balanced transaction’s entries atomically, enforce the posting API, and use new reversal entries for corrections.

**Trade-off:** Schema and accounting model need careful design, including fees and currency boundaries.

**Failure to probe:** A “repair” edits old entries and destroys audit history.

**Interviewer follow-up:** How do you verify a journal balances across all its rows?

### Idempotency and provider uncertainty

**Problem:** Prevent retries from issuing duplicate business effects.

**Naive approach and why it fails:** Use a random key on every HTTP attempt.

**Common solution:** Reuse a scoped logical payment key, persist request hash/result, serialize duplicates, and reuse the provider key.

**Trade-off:** Retention must cover retry horizons; provider guarantees are bounded.

**Failure to probe:** Same key is submitted with a different amount.

**Interviewer follow-up:** What if the provider’s deduplication retention has expired?

### Wallet concurrency and reconciliation

**Problem:** Maintain spend limits and detect divergence from external statements.

**Naive approach and why it fails:** Compute SUM(entries), then approve a debit outside a transaction.

**Common solution:** Lock accounts in stable order or conditionally debit; atomically post the journal; reconcile provider settlements with local attempts.

**Trade-off:** Hot accounts serialize; reconciliation repairs asynchronously rather than making the external call atomic.

**Failure to probe:** Charge succeeds but no local success state is committed.

**Interviewer follow-up:** How does the operator distinguish a missing event from a missing payment?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Idempotency key + request hash | Deduplicate the same logical attempt and reject changed parameters. |
| Balanced append-only postings | Make monetary effects explainable and reversals auditable. |
| Atomic debit predicate | Prevent concurrent overspending under the declared overdraft policy. |
| Reconciliation | Compare provider/settlement truth with durable local attempts after ambiguous failures. |
| Outbox + idempotent consumer | Publish journal effects without assuming one delivery. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### A balanced posting is an atomic unit

#### What problem does it solve?

Prevent money from appearing in one account without a counterpart.

#### How does it work?

Represent a journal transaction with multiple signed entries summing to zero for each currency. A database transaction commits all entries. Restrict writes through a validated posting procedure or deferred constraint trigger; an ordinary row CHECK cannot enforce a cross-row sum.

#### Example

```text
transaction T91, currency USD
wallet:alice     -2500 cents
merchant:pending +2400 cents
platform:fees     +100 cents
sum                  0 cents
```
Store integer minor units with currency metadata; do not use binary floating point. A refund is a new transaction referencing T91, not deletion of T91.

#### Failure scenario

Two balanced transactions can still double-charge a customer. Balance conservation does not imply business uniqueness; enforce unique payment-attempt posting identity as well.

#### Trade-offs

Fees, settlement, FX and reserves introduce additional accounts. Balance each currency with explicit FX/clearing legs rather than summing different currencies.

#### When would I use it?

Wallets, stored value, settlement or auditable internal accounting.

#### Interview questions around this topic

How would you implement a partial refund without mutating the original entry?

### A durable idempotency protocol

#### What problem does it solve?

Return one result when callers cannot know whether their first request completed.

#### How does it work?

Scope keys by tenant and operation. Persist a unique key, request hash and attempt state before the external call; concurrent duplicates observe the same attempt. Reuse the provider key and write the terminal result through guarded transitions.

#### Example

Client retries key K7 with USD 25.00: resume/return K7. Client uses K7 with USD 30.00: reject parameter mismatch. Two workers race K7: only one owns the local claim; provider deduplication still protects against lease overlap.

#### Failure scenario

A worker pauses past its lease, another takes over, and both call the provider. A local lease alone is insufficient; the same provider idempotency key must cover both attempts.

#### Trade-offs

A provider may expire keys or lack idempotency. After retention expiry, query known provider IDs and reconcile; do not blindly replay a potentially successful charge.

#### When would I use it?

Payments and any expensive external effect with ambiguous network outcomes.

#### Interview questions around this topic

Why can a local unique row not alone guarantee a single remote charge?

### Spending and settlement are different states

#### What problem does it solve?

Prevent concurrent overspending while respecting pending external effects.

#### How does it work?

Track available, held and posted funds. Reserve spending power atomically, then finalize or release after a verified outcome. Keep the journal and any materialized balance consistent in one local transaction.

#### Example

```sql
UPDATE wallets SET available_cents = available_cents - 8000
WHERE id = :wallet AND available_cents >= 8000
RETURNING id;
```
If this returns a row, insert the corresponding balanced posting/hold records in the same transaction. If it returns none, reject; roll back everything if posting fails.

#### Failure scenario

A settlement report shows a charge that the API recorded UNKNOWN. Match by durable attempt/provider reference, then advance state once. Investigate amount/currency mismatches rather than silently overwriting.

#### Trade-offs

Derived balances speed authorization but add consistency obligations; journal scans are simpler conceptually but expensive for hot accounts.

#### When would I use it?

Concurrent wallet debits, authorization holds and settlement pipelines.

#### Interview questions around this topic

What does your available balance mean when a chargeback arrives?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. Why is a mutable balance not a ledger?

2. What does double-entry conservation guarantee?

3. Why avoid floating-point amounts?

4. What is a logical payment identity?

5. Why store a request hash with a key?

6. Why is UNKNOWN different from FAILED?

7. Why are reversals new entries?

8. Does a balanced ledger prevent overspending?

9. What does reconciliation compare?

10. Why does idempotency have a retention contract?

### Scenario questions

11. The provider charges and the process crashes. Recover.

12. Two debits of 80 race against 100. Who wins?

13. A webhook reports success twice. What happens?

14. The same idempotency key arrives with a different currency. Respond.

15. A refund times out. What is the next action?

### Trade-off questions

16. Strong consistency or eventual consistency for wallet authorization?

17. Append-only journal or editable transactions?

18. One account lock or global payment lock?

19. Webhook-only recovery or scheduled reconciliation?

20. Automatically retry forever or bound retries?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** It reports a total but loses the independently auditable history that explains each movement.

**2.** A posted journal balances within its currency/accounting model. It does not by itself prevent duplicate business payments or fraud.

**3.** Binary floating-point cannot represent many decimal amounts exactly; explicit minor units/decimal types avoid rounding drift.

**4.** A durable business attempt reused across transport retries, distinct from each HTTP request ID.

**5.** Reusing a key with a different amount or recipient must be rejected, not treated as an identical operation.

**6.** UNKNOWN means the remote effect may have succeeded. FAILED should represent a verified outcome under the provider contract.

**7.** They preserve what happened and when; editing old postings destroys auditability and can invalidate downstream reports.

**8.** No. Concurrent spending requires a protected available-funds decision as well as balanced entries.

**9.** Local attempts/postings against provider charges, refunds and settlement statements using durable references and amounts/currencies.

**10.** Once keys are forgotten, late retries can be treated as new. Retention must match the business retry horizon or require lookup instead.

**11.** Keep the attempt UNKNOWN, query or retry with the same provider key, then post the verified result once. Never create a fresh identity just because the response was lost.

**12.** A guarded debit or locked transaction allows one and rejects the other under a no-overdraft policy; both cannot act on an unprotected earlier read.

**13.** Deduplicate event delivery and guard the payment/posting transition by logical payment identity; different event IDs can still describe one payment.

**14.** Reject it as a parameter mismatch. Returning the previous result without flagging the mismatch hides a client bug.

**15.** Keep a durable refund attempt and reuse its key or query its provider reference; refunding again with a new key risks over-refunding.

**16.** Spendability requires coordinated checks to prevent double spending. Analytics and statement projections can lag if explicitly defined.

**17.** Append-only postings preserve audit and replay. Corrections use linked reversals; operational annotations may be mutable without rewriting money history.

**18.** Lock only the invariant’s account set, ordered consistently. A global lock prevents unrelated payments from progressing.

**19.** Webhooks are fast but can be missing, duplicated or delayed. Reconciliation closes those gaps using authoritative provider records.

**20.** Bound attempts and back off transient errors; preserve unresolved state and escalate old uncertainty. Dropping the record loses correctness; infinite hot retries overload providers.

</details>

## End-to-End Request Walkthrough

Client submits payment key → validate amount/currency and hash → persist attempt → reserve wallet funds if applicable → call provider with stable key → verify outcome → transaction posts balanced entries and terminal payment state with an outbox record → respond or let the client poll. Reconciliation revisits UNKNOWN attempts and compares settlement. The unique identity guards duplicate effects; the journal guards auditability; atomic balance checks guard spendability.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Provider times out | Outcome is ambiguous; availability degrades without proving failure. | Query/retry the same attempt; alert on aging uncertainty. |
| Database primary fails | No local success should be invented from a missing response. | Recover the committed state under the promised durability policy and replay guarded operations. |
| Duplicate Kafka event | At-least-once delivery can repeat a posting request. | Unique business posting identity prevents a second monetary effect. |
| Reconciliation discovers an amount mismatch | Correctness is suspect; automatic silent correction would hide evidence. | Quarantine, preserve records and use an audited resolution/reversal workflow. |

## What Should Trigger In My Head?

**Payment / wallet →** stable logical identity · UNKNOWN is a state · balanced postings · spendability lock · reconciliation · audited reversal.
