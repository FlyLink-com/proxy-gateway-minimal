# `config/commercial/`

Commercial configuration templates live here. They are **templates**, not
live pricing. The repository must not invent or publish live prices,
currencies, taxes, discounts, paid-package byte amounts, refund windows, or
SLA percentages without an operator-approved business decision.

## Files

- `pricing.example.json` — template shape for the commercial pricing
  payload. Every value that would carry a real number is `0` or `null`,
  and the document carries `status: "template-not-live"`. Copy this file
  to `pricing.json` only after an operator-approved pricing decision
  exists; commit the decision as a separate Risk B PR with the new file
  and a citation to the source decision record.

## Why a template, not live config

`docs/COMMERCIAL_MODEL_V1.md` says, verbatim:

> Prices, currencies, taxes, discounts, and paid-package byte amounts are
> business configuration outside this baseline. The repository must not
> invent or publish them until an operator-approved pricing decision
> exists.

`docs/PACKAGE_BOUNDARY.md` Hard Stops reiterates:

> Prices, currencies, taxes, discounts, paid-package byte amounts are
> business configuration outside this baseline. The repository must not
> invent or publish them without an operator-approved pricing decision.

The template ships with zero and null values precisely so that the file
can exist (and the loader can be exercised in test) without ever
encoding a live price.

## Promotion to live config

To promote this template into a real `pricing.json`:

1. Capture the operator-approved pricing decision in a separate doc with
   a `document_metadata` block (Risk C PR).
2. Replace the template's zero/null values with the approved values.
3. Bump `version`, set `issuedAt`, and populate `auditTrail.approvedBy`
   and `auditTrail.approvedAt`.
4. Render the new file through the admin/site pricing page only after
   the company-site static build verifies it.

No live payment provider may be wired against `pricing.example.json`;
the template's `status: "template-not-live"` is a structural stop.

## Out of scope here

- Payment-provider credentials (`docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`)
- Refund / dispute SLA text (counsel + ops)
- Tax residency, VAT, GST, US-sales-tax handling (counsel)
- Multi-tenant price variation (gap G5 in
  `docs/COMMERCIAL_LAUNCH_READINESS.md`)