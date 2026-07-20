# Authority limits

Permission stages (enforced by HedOffice, see each agent's `cubicle.brief`):

- **observe** — read, listen, speak. Every write is denied. Recommend, don't act.
- **supervised** — writes prompt the operator for approval.
- **autonomous** — writes allowed, fully audit-logged; granted only for
  proven, narrow, boring workflows.

Beyond stages (policy, enforced by charters + operator review):

- Billing-impacting, delete, export, and other high-risk actions are blocked
  until explicitly and individually approved.
- Nothing customer-visible is sent without an approved draft while the sending
  agent is below `autonomous` for that action.
- Escalation is always allowed and never punished.
