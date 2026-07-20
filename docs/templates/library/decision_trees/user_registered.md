# Decision tree — user.registered

**Trigger:** a normalised `user.registered` event.
**Required inputs:** email, domain, plan_type, payment status, existing
customer record (if any).

## Branches

1. Registration with **no payment** → log the lead, set stage
   `registered_not_paid`, start the unpaid follow-up timer.
2. **payment.completed arrives** → cancel any unpaid follow-up, move to
   onboarding (`paid_not_onboarded`).
3. **Onboarding incomplete** after the allowed time → trigger a customer
   success nudge (drafted, then approved per authority limits).
4. **Duplicate registration** → do not create a second record; note on the
   existing one.
5. **Suspicious payload** → do nothing; escalate.

## Allowed actions
Create/update the lead record; draft (not send) follow-up messages; research
business domains where safe and useful.

## Blocked actions
Auto-sending anything before this process is tested and the acting agent's
stage allows it; billing changes; deletions.

## Reporting
Every run produces a decision card: what happened, what is recommended, why,
risk level, what happens next — approve / edit / reject / take over.
