# Mobile (Capacitor) — Paused

Capacitor iOS scaffolding exists under `peep/ios/`, but **mobile is not an active product surface** right now.

## Current status

- Web app is the primary delivery target (Cloudflare Pages).
- Capacitor deps remain for future native builds but are not part of CI or release.

## Before shipping iOS

1. App Store IAP rules vs Stripe web billing
2. Safe areas (`theme.layout.safeTop` already accounts for `capacitor:` protocol)
3. Background audio for podcasts
4. Push notifications for go-live alerts

Until then, treat Capacitor as experimental — do not block web work on mobile parity.
