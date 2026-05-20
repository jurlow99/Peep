# Creator Revenue Share

## How It Works

Every month, **50% of Peep's total revenue goes into a creator pool**. Each creator's cut is based on how much of the platform's total watch time their content drove that month.

The per-minute rate is never fixed — it grows as Peep grows. More subscribers = more revenue = bigger pool = more money per watch minute.

---

## Formula

```
Creator Pool  =  Total Revenue × 50%
Your Payout   =  Creator Pool × (Your Watch Minutes ÷ Total Watch Minutes on Platform)
```

---

## Example

| | |
|---|---|
| Peep revenue this month | $2,000 |
| Creator pool (50%) | $1,000 |
| Your content's share of watch time | 30% |
| **Your payout** | **$300** |

---

## What Counts as a Watch

- A session must reach at least **25% of an episode's runtime** to count
- Each viewer only counts **once per episode per month** regardless of rewatches
- Watch time is tracked automatically via `watch_progress`

---

## Payment Schedule

Payments go out on the **15th of each month** for the previous month's watch data.

Example: April watch time → paid May 15th.

---

## Running Payouts (Admin)

1. Go to **The Boss → Payouts**
2. Confirm the month is set to last month
3. Enter total revenue for that month (subscriptions + any other income)
4. Click **Calculate**
5. Review each creator's watch time, share %, and payout amount
6. Click **Mark Paid** after sending each payment
7. Export CSV for your records

The **Next Payout Due** banner shows the upcoming payment date and turns red if it's past the 15th with unpaid creators.
