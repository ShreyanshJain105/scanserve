# ADR-044: Order Dashboard Notifications (Toast + Sound)

**Date:** 2026-04-04
**Status:** Accepted

## Context
Layer 8 order management currently relies on polling + focus/visibility refresh to surface new orders. The user requested adding a notification using the web app’s toast message component and a unique notification sound for new orders. We need a clear policy for when notifications fire, how we detect “new,” and how to handle user control (mute/quiet hours) without creating noise or duplicate alerts.

## Decision
Implement new-order notifications on the orders dashboard using the existing toast system and a bundled sound asset. Notifications will fire only when the dashboard is mounted and a polling refresh detects one or more newly created orders since the last successful fetch, avoiding duplicate alerts for already-seen orders.

High-level behavior:
- Track the newest order ID + created timestamp (or a stable “latest” signature) per polling cycle.
- When the next poll returns orders that include a newer signature than the last seen, fire a toast and play a sound once per poll cycle (not per order).
- Use the existing toast component for the message and add a distinct short notification sound bundled in `apps/web/public/`.
- Respect browser autoplay rules: play sound only after a user interaction has occurred on the page; otherwise show toast-only.
- Notifications only fire while the orders dashboard page is visible; no mute toggle is provided (always-on toast + sound).

## Consequences
- Adds a small client-side state to detect new orders and prevent duplicate notifications.
- Requires a short audio file asset and logic to handle user interaction + playback failures.
- If the polling API order changes, the “newest signature” logic must be kept in sync (e.g., using `createdAt` + `id`).

## Questions & Answers

### Questions for User
- Q1: Should notifications fire only when the orders dashboard tab is visible, or also when it is hidden?
- Q2: Do you want a user-facing mute control (toggle) for the sound, or is toast + sound always-on acceptable?
- Q3: Do you have a preferred sound file to include, or should I generate/use a small built-in tone (e.g., a short chime) stored in `apps/web/public/sounds/`?

### Answers (to be filled by user)
- A1: yes only when orders dashboard page is open
- A2: always -on
- A3: use a tone by yourself
