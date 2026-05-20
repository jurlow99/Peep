# Creator System

## Overview

Peep pays creators a share of monthly revenue based on how much their content was watched. See [revenue-share.md](revenue-share.md) for the full payout formula.

---

## Adding a Creator

Go to **The Boss → Creators → Add Creator**.

Fields:
- **Name** — creator's full name
- **Email** — for records and CSV export
- **Payment Method** — PayPal, Venmo, Cash App, Bank Transfer, or Other
- **Payment Handle** — PayPal email, Venmo/Cash App username, etc.
- **Bank Transfer** — shows Account Number + Routing Number fields instead of handle
- **Status** — Active or Inactive. Inactive creators are excluded from payout calculations.
- **Notes** — internal notes only, not visible to the creator

---

## Linking Content

Each creator must have their content linked before watch time counts toward their payout.

1. Open a creator (edit)
2. Scroll to **Linked Content**
3. Select a show, movie, music video, or podcast from the dropdown
4. Click to link — saves a row in `content_creators`

Watch time flows like this:
- User watches **Episode 5** of Show X
- System finds Episode 5 → belongs to Show X → Show X is linked to Creator A
- Creator A gets credit for that watch session

You can link at the **show/podcast level** (all episodes count) or at the **individual content level**.

---

## content_creators Table

Junction table linking creators to content.

| Column | Type | Description |
|---|---|---|
| creator_id | uuid | FK → creators |
| content_id | text | ID of the show, movie, etc. |
| content_type | text | show, movie, music_video, podcast |

---

## Fraud Protection

The payout system has built-in protections:
- **25% threshold** — a watch session only counts if the viewer watched at least 25% of the episode
- **Deduplication** — the same viewer rewatching the same episode only counts once per month
- **Fraud flag** — if one account drives more than 40% of a creator's watch time, a "Suspicious" badge appears (must be enabled in The Boss settings)
