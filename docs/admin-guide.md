# Peep Admin Guide

This guide covers everything you need to manage the Peep platform as an admin. It assumes you have been given an account with admin access.

---

## Getting In

1. Go to **watchpeep.tv/admin**
2. Sign in with your email and password
3. You'll land directly in the CMS dashboard

To sign out, click **Log Out** in the top-right corner of the CMS.

---

## Dashboard Overview

The CMS has 8 tabs across the top:

| Tab | What you do here |
|-----|-----------------|
| **Content** | Manage all movies, shows, episodes, podcasts, music, and carousels |
| **Live** | Manage live TV channels |
| **Creators** | Invite creators, review uploaded episodes, manage payouts |
| **Members** | View users, subscriptions, and handle support requests |
| **Analytics** | Monitor watch stats, revenue, and ad performance |
| **Storage** | Review uploaded video files |
| **Settings** | Control app-wide settings, promo codes, maintenance mode |
| **Security** | Monitor login attempts and manage blocked accounts |

---

## Content Tab

This is where all video content lives. Use the sub-tabs to navigate:

- **Movies** — standalone films
- **Series** — TV shows (just the show itself, no episodes here)
- **Episodes** — individual episodes linked to a series
- **Podcasts** — podcast shows and their episodes
- **Music** — music videos, songs, and albums
- **Carousels** — the rows that appear on the home screen (e.g. "Horror", "Trending")

### Adding a Movie
1. Go to **Content → Movies**
2. Click **+ Add Movie**
3. Fill in title, description, category, rating, year, and paste the video URL
4. Upload a thumbnail and poster image
5. Click **Save**

### Adding a Series + Episodes
1. Go to **Content → Series**, click **+ Add Series**, fill in details, save
2. Go to **Content → Episodes**, select the series from the dropdown
3. Click **+ Add Episode**, fill in season/episode number, title, URL, save

### Editing or Deleting Content
- Click any row in the list to open the edit panel
- To delete, click the trash icon — you'll be asked to confirm

### Carousels
Carousels control what rows appear on the home screen and in what order.
- **Type: Category** — automatically shows content matching a genre (e.g. "Horror")
- **Type: Trending** — shows most-watched content
- **Type: Custom** — you hand-pick exactly which titles appear
- The **Position** number controls the order (lower = higher on the page)
- Toggle **Enabled** to show or hide a row without deleting it

---

## Live Tab

Manage live TV channels. Each channel has:
- A stream URL (HLS `.m3u8` link)
- A channel number, thumbnail, and badge text (e.g. "LIVE")
- An **EPG** (programme guide) — schedule what's airing and up next

### Adding a Channel
1. Click **+ Add Stream**
2. Fill in title, stream URL, channel number, thumbnail
3. Toggle **Is Live** on
4. Save

### Testing Channels
Use the **Test All Channels** button to check which streams are currently online. A green dot means live, red means down.

---

## Creators Tab

This is where you manage creator partners — people who upload content and earn a share of revenue.

### Inviting a Creator
1. Go to **Creators → Creators**
2. Click **+ Add Creator**
3. Enter their name and email
4. Fill in their payment method (PayPal email or bank details)
5. Click **Add Creator** — they'll receive an invite email with a link to set their password

Once they click the link and set a password, they'll log in at **watchpeep.tv** and land directly on their Creator Dashboard.

### Linking Content to a Creator
After adding a creator, open them by clicking their row.
- Scroll to **Linked Content**
- Use the dropdown to link their shows, movies, or podcasts
- This is how watch time gets attributed to them for payouts

### Resending an Invite
If a creator didn't receive their email or lost the link:
1. Open the creator record
2. Click **↺ Resend Invite** at the bottom of the modal

### Review Queue
When a creator uploads an episode, it sits in **Pending Review** before going live.

1. Go to **Creators → Review Queue**
2. You'll see all pending episodes with a video preview
3. Click **Approve** to make it live — the creator gets an email confirmation
4. Click **Reject** to decline — you'll be prompted to write a note explaining why, and the creator gets notified

A red badge on the Creators tab shows how many episodes are waiting for review.

### Payouts
1. Go to **Creators → Payouts**
2. Select the month you want to process
3. Click **↓ From Stripe** to pull the actual revenue for that month from Stripe
4. The system calculates each creator's share based on their watch time percentage
5. Click **Mark Paid** once you've sent payment — this records the date and notifies the creator
6. Note: creators need at least **$10** to be eligible for payout

---

## Members Tab

### Users
A list of all registered accounts. You can:
- Search by email
- View when they signed up
- Delete an account if needed (requires confirmation)

### Subscriptions
A list of all active and cancelled subscriptions pulled from Stripe.
- Filter by status (active, cancelled, past due)
- Sort by date, email, or amount
- Revoke a subscription manually if needed

### Support
Use this to look up a specific user and take action on their account:
1. Search by email
2. Click the user to see their subscription status, profiles, and watch history
3. Available actions:
   - **Grant Access** — manually give them a subscription (e.g. for a promo or error)
   - **Revoke Access** — remove their subscription
   - **Reset Password** — send them a password reset email
   - **Delete Account** — permanently remove the account

---

## Analytics Tab

### Reports
Shows platform-wide stats:
- Active users right now (live, updates every minute)
- Watch time by content
- Sign-ups over time
- Revenue summary

### Ads
Manage VAST ad tags:
- Add pre-roll or mid-roll ad tags
- Set scope (global or specific to a piece of content)
- Toggle active/inactive without deleting

---

## Settings Tab

### App Settings
- **Maintenance Mode** — toggle this to take the site offline for all users (they see a "We'll be right back" screen). Turn it off to bring the site back up.
- **Banner** — show a site-wide announcement banner. Set the text and an expiry date.

### Promo Codes
Create discount codes for new subscribers:
1. Click **+ Add Promo**
2. Enter a name and code (e.g. `LAUNCH50`)
3. The code can be shared and entered during signup

### Todos & Goals
An internal notepad for tracking tasks and revenue goals. Only visible to admins.

---

## Security Tab

### Login Attempts
A log of all failed login attempts at `/admin`. If you see a burst of attempts from the same IP, someone is trying to brute-force access.

### Blocked Users
- Add an email to block a user from signing in entirely
- Blocked users are stopped at the auth check even if their account exists

### Lockout Settings
Configure how many failed login attempts trigger a lockout and for how long.

---

## Common Tasks — Quick Reference

| Task | Where |
|------|-------|
| Add a new movie | Content → Movies → + Add Movie |
| Add a new show + episodes | Content → Series, then Content → Episodes |
| Invite a creator | Creators → Creators → + Add Creator |
| Review a creator's upload | Creators → Review Queue |
| Process monthly payouts | Creators → Payouts |
| Look up a user | Members → Support |
| Grant someone free access | Members → Support → search user → Grant Access |
| Put the site in maintenance | Settings → Maintenance Mode |
| Block an account | Security → Blocked Users |
| Check who's watching right now | Analytics → Reports |

---

## Tips

- **Always link content to creators before processing payouts** — unlinked content won't count toward their share
- **Approve or reject episodes promptly** — creators can see the pending status on their dashboard and are waiting
- **Test channels regularly** — stream URLs go dead without warning
- **Back up promo codes somewhere** — they're not exported anywhere automatically
