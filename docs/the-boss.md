# The Boss

The Boss is the protected admin control panel inside the CMS. Access requires the passcode **0319**.

Navigate to it via the **Boss** tab in the CMS.

---

## Features

### Boss Board
A personal TODO list and goals tracker. Two sections:

- **Goals** — big milestones (first licensed content, team hires, etc.)
- **To-Do** — actionable tasks (legal, tech, business)

Items can be labeled: Legal, Tech, Business, Content, Finance. Persists in `app_settings`.

---

### Maintenance Mode
Puts the entire app into a "Be right back" screen for all users. The admin panel still works at `/admin`.

---

### Grant Access by Email
Give any existing account free subscriber access instantly. Shows as COMP in subscriptions.

---

### Creators
Manage creator partnerships. Add creators, link their content, manage payment info. See [creators.md](creators.md).

---

### Payouts
Run monthly creator payouts based on watch time. See [revenue-share.md](revenue-share.md).

---

### Payout Fraud Detection
Toggle in The Boss main page. When enabled, flags creators where one account drives over 40% of their watch time with a "Suspicious" badge in the payout table. Off by default — turn on once you have enough real viewer volume.

---

### Security
- Login attempt log with timestamps and pins entered
- Lockout settings — max attempts and lockout duration
- Blocked users — block accounts by email
- Active sessions — see who's online

---

## Access

The Boss passcode is stored in the codebase. To change it, search for `0319` in `CMS.jsx`.
