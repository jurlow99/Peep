# Peep finances and partner payments

Reviewed against repository code on October 22, 2026. This document describes the
current implementation and open decisions; it does not establish new payment
terms or certify that the deployed payout workflow is ready for settlement.

## What already exists

| Area | Current repository behavior |
|---|---|
| Creator pool | `CMS.jsx` calculates 50% of the revenue amount entered in admin. |
| Allocation | Divides the pool by each creator's qualifying, linked content progress relative to all qualifying creator-linked content progress. |
| Qualification | Keeps the highest progress per account/content; requires 25% of known duration, or 60 seconds when duration is unknown. Selects records by `first_watched_at` in the month. |
| Small balances | Calculates rollover from prior unpaid records below $10 that have not been consumed. Persistence and settlement need review before relying on this. |
| Payment records | `creator_payouts`, paid/unpaid status, history, audit-log writes and CSV export. |
| Money movement | **Mark Paid does not transfer funds.** The operator must send payment separately and then record it. |
| Stripe import | `get-stripe-revenue` sums successful, non-refunded charges created in the selected UTC month. This is not an ad-revenue import or a bank-settlement reconciliation. |
| Advertising | Web VAST/IMA player code, tag management and ad-event reporting exist. Native Apple TV pre-roll CSAI is integrated in dev with sample-ad verification; paid-provider validation remains. |
| Live TV | Viewing sessions and multiview metrics exist. They are not used by the current creator payout calculator. |

The existing [revenue-share guide](revenue-share.md) and
[creator-facing guide](CREATOR_REVENUE_SHARE.md) describe a 50% pool and payment on
the 15th. Treat these as existing documented terms to review, not as evidence of
automated transfers or a new agreement covering live-channel ad revenue.

## How advertising money reaches people

A VAST tag requests ads and supplies playback/tracking instructions. It does not
hold money, split revenue or pay partners. The account and agreement behind the
tag determine who receives the provider's payments.

| Arrangement | Provider pays | Peep's responsibility |
|---|---|---|
| Channel partner supplies their tag | The account holder under that provider agreement | Deliver and track ads correctly; reconcile any separate amount owed to Peep. |
| Peep supplies its tag | Peep's account under its provider agreement | Reconcile provider revenue and pay partners according to their agreements. |

Do not assume a tag automatically shares revenue with Peep or a channel owner.
Record the tag's owner, credited provider account and intended platform/channel.
Confirm browser, Apple TV and multiview usage with the provider.

## Worked examples

### Partner-owned tag

Local Sports TV provides its stream and its own ad tag. Peep plays ads and sends
tracking. If the provider confirms $100 payable to Local Sports TV, that provider
pays Local Sports TV under their agreement. Peep does not owe that same $100 again.
Any share owed to Peep requires a separate agreed settlement arrangement.

### Peep-owned tag

Peep's provider confirms $100 in revenue eligible for sharing. If a specific
channel agreement assigns 70% of that defined amount to the partner, the partner
is owed $70 and Peep retains $30 before any other applicable obligations.
**70/30 is an illustration, not Peep's current configured policy.**

### Existing creator pool

If the approved revenue input is $2,000, the current 50% formula produces a
$1,000 creator pool. A creator with 30% of qualifying linked-content progress gets
a $300 base calculation, before rollover. This is a different allocation method
from a channel-specific ad split; do not apply both to the same revenue unless
the agreements explicitly require it.

## Numbers that must remain distinct

- Ad requests: attempts to obtain ads; some return no ad.
- Playback events: impressions/completions reported by the player.
- Estimated earnings: provisional provider figures, subject to adjustments.
- Confirmed revenue: provider statement amounts under the applicable agreement.
- Cash received: actual provider payment received by the account holder.
- Partner payable: the amount owed under the partner's agreed calculation.
- Cash paid: the actual transfer to the partner, with a payment reference.

Peep's viewing hours or ad-event counts alone do not establish money owed by an
ad provider. Simulator/test events must not be treated as billable earnings.

## Gaps before dependable financial settlement

1. Record each partner's arrangement: tag owner, revenue source, eligible revenue
   definition, split or pool participation, permitted deductions and payment terms.
2. Reconcile ad-provider statements and receipts. No automatic import was found.
3. Review the Stripe calculation: it does not subtract processor fees, account for
   partial refunds properly, reconcile disputes or separate currencies. Do not
   label its result net revenue or available cash.
4. Decide explicitly whether and how live-channel revenue joins the creator pool.
   Live TV/multiview viewing reports do not currently allocate partner earnings.
5. Validate settlement calculations on the server, with currency-safe rounding,
   immutable approved monthly amounts, checked write errors and duplicate-payment
   prevention. The current calculator runs in the browser and can recalculate
   displayed amounts independently of saved paid records.
6. Review `watch_progress` suitability for payouts: saved resume position is not
   a complete monthly viewing ledger, and `first_watched_at` does not measure all
   activity in a month. Do not equate it with verified billable ad delivery.
7. Store payment references and reconcile actual transfers before marking paid.
   Automatic partner transfers have not been implemented in this workflow.

## Suggested monthly operating flow

Collect provider statements and receipts → reconcile adjustments → determine the
agreed shareable amount → calculate and approve partner payables → send payments
through the chosen payment service → record references → reconcile and archive.

Payment due dates and whether payment depends on provider receipt must come from
the applicable agreements. Keep balances and exceptions visible to the owner and
authorized finance staff in web admin.

## Code and related documents

- [CMS payout calculation and status recording](../peep/src/components/CMS.jsx)
- [Stripe revenue import](../supabase/functions/get-stripe-revenue/index.ts)
- [Ad playback and management](ads.md)
- [Creator revenue-share guide](revenue-share.md)
- [Live TV reporting data](database.md)

No payout policy, financial records, provider accounts or money transfers were
changed as part of this documentation review.
