# Peep — Product Overview

Visual reference for the Peep streaming platform. Screenshots and descriptions of key screens and flows.

---

## Signup Flow

The signup flow is 3 steps: Account → Password → Payment.

### Step 3 — Payment

![Signup Payment Step](screenshots/signup-payment-step.png)

Users arrive here after creating their account and password. Three plan options are shown side by side.

**Plans:**

| Plan | Price | Badge | Perks |
|------|-------|-------|-------|
| Founding Member | $2.99/mo | LIMITED | Ad-free forever, Founding badge, Lock in this price |
| Founding Annual | $19.99/yr | BEST VALUE | Ad-free forever, Founding badge, Save 44% |
| Standard | $10/mo | FLEXIBLE | All content, Cancel anytime |

- Founding Member is pre-selected by default to drive lower-friction conversions
- The subscribe button label and billing fine print update dynamically based on selected plan
- Promo code entry available via link below the card form

**File:** `peep/src/pages/AuthPages.jsx` — `PaymentStep` component

---

## Paywall

Shown to signed-in users who don't have an active subscription. Identical plan selector to the signup flow.

**File:** `peep/src/pages/PaywallPage.jsx`

---

## Settings Page

### Subscription & Billing

Shows the user's current plan with status badge. Founding members see a gold **★ FOUNDING MEMBER** badge. The owner account (`jacob.furlow@outlook.com`) sees a **👑 OWNER** badge with full access, no billing.

**Cancel flow:** Users can cancel inline — choose between:
- Cancel at end of billing period (keeps access, no refund)
- Cancel immediately (access ends now, prorated refund issued)

**File:** `peep/src/App.jsx` — `SettingsPage` component

### Owner Panel

Only visible to `jacob.furlow@outlook.com`. Contains a direct link to the Admin Dashboard.

---

## Admin Dashboard

Located at `/admin`. Requires an account with `role = 'admin'` in the profiles table.

See [admin-guide.md](admin-guide.md) for full documentation.

---

*Add new screens below as the product grows.*
