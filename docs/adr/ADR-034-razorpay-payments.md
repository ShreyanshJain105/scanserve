# ADR-034: Razorpay Payments (Replace Stripe)

- Status: Accepted
- Date: 2026-03-24

## Context
- Current Layer 7 implementation uses Stripe Checkout Sessions + webhook to confirm payment.
- Stripe does not support UPI for the target markets; Razorpay does.
- We need to replace Stripe with Razorpay in API + web flows and remove Stripe dependencies/config.

## Decision
1) **Provider switch**
   - Replace Stripe with Razorpay for all payment flows.
   - Remove Stripe SDK usage, webhook route, env vars, and related tests.
2) **Checkout flow**
   - Server creates a Razorpay Order from the verified server-side cart total.
   - Client opens Razorpay Checkout with orderId + business details (name, contact, notes).
   - On successful payment, client posts Razorpay payment payload to server for signature verification.
3) **Server verification**
   - Verify Razorpay signature server-side using `RAZORPAY_KEY_SECRET`.
   - Mark order `paymentStatus=paid` and `status=confirmed` only after verification.
   - If verification fails, keep `paymentStatus=pending` and return `PAYMENT_VERIFICATION_FAILED`.
4) **Public endpoints**
   - `POST /api/public/orders` unchanged (item ids + qty only; server computes total).
   - Replace `POST /api/public/orders/:id/checkout` with Razorpay order create response (`razorpayOrderId`, keyId).
   - Add `POST /api/public/orders/:id/verify-payment` to validate Razorpay signature and finalize order.
5) **Env/config**
   - Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
   - Remove Stripe envs and Stripe webhook config.
6) **Frontend**
   - Load Razorpay Checkout script in the menu flow (on-demand).
   - Use Razorpay order id + key id from API to initiate payment.
   - After success, call verify endpoint then redirect to `/orders?orderId=...`.
7) **Tests**
   - Replace Stripe tests with Razorpay order creation + signature verification tests.
   - Update web tests to mock Razorpay flow triggers and verify calls.

## Consequences
- Adds Razorpay dependency and removes Stripe dependency.
- Requires client-side Razorpay SDK/script loading and signature verification endpoint.
- Webhook-based confirmation replaced by explicit client verification callback (acceptable for MVP).
