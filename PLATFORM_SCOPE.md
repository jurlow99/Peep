# Peep platform scope

Recorded from the platform owner's direction on October 21, 2026.

## Goal

Build the Peep viewer platform and its web-based admin. The platform owner can
hire a team to operate the platform through that admin. This is the core product
scope; do not assume that every existing experimental feature is a priority.

## Viewer platform

- Viewers browse and watch content through the browser and native Apple TV app.
- Future mobile and TV clients can join the same platform.
- Viewer apps consume shared content and configuration managed through admin.
- Apple TV is a viewer app, not an admin client.

## Web admin

- Admin is web-only and serves the whole platform, including browser, Apple TV,
  and future viewer clients.
- The owner and hired staff manage content, channels, scheduling, users, and
  platform operations there.
- Support staff invitations and role-based permissions so the owner controls
  each team member's access. This is a product requirement, not a claim that the
  complete workflow already exists.
- Shared admin changes should reach the applicable viewer clients. Clearly
  distinguish platform-specific settings from shared settings; do not assume
  that an admin control works on Apple TV until its client support is verified.

## Working direction

- Standing requirement added October 27, 2026: every new Peep feature must
  include its corresponding web-admin support in the same implementation scope.
  The owner and staff must be able to manage the feature's applicable content,
  configuration, and operations through admin. Reuse existing admin controls
  where they already meet that need; presentation-only polish does not require
  an artificial admin setting.
- Verify that admin changes reach each applicable viewer client, including
  Apple TV. Do not call a feature complete when required admin support or its
  client integration is missing; clearly identify any remaining gap.
- Prioritize the viewer experience and the owner's/team's ability to operate it.
- Do not add admin screens to Apple TV or pursue full web feature parity by default.
- Current local testing should use FARRIS development, with browser/admin and
  Apple TV connected to the same development backend. Verify actual configuration;
  a development badge alone does not prove that the connections match.
- Preserve existing uncommitted work and Xcode signing settings during changes.
- Apple TV uses black and grey surfaces, yellow outlines for the currently
  focused item, and yellow fills for selected controls. Unfocused items stay
  black and grey. The owner requested yellow focus borders on October 21, 2026.
