# Tech debt

Known compromises. Each one was *accepted*, not accidental — the point of writing
them down is that the next person can tell the difference, and does not "fix"
something that was a deliberate trade.

An item leaves this list when it is fixed, or when it is promoted to an
[ADR](../docs/adr/README.md) as a decision being kept on purpose.

Format: what it is, why it was accepted, where it lives, and a rough effort
(S / M / L).

---

- [ ] **Example: no rate limiting on the API yet.** Fine for a single-tenant
      internal tool; the first time this faces the public internet it is the first
      thing to add. *Where:* the API entry point · *Effort:* S
