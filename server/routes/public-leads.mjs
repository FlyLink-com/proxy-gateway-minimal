import { Router } from "express";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizePublicLeadSubmission(payload, now = new Date()) {
  const organization = cleanString(payload?.organization, 120);
  const email = cleanString(payload?.email, 160).toLowerCase();
  const direction = cleanString(payload?.direction, 120);
  const stage = cleanString(payload?.stage, 120);
  const message = cleanString(payload?.message, 1200);

  if (!organization || !email || !direction || !message || !EMAIL_PATTERN.test(email)) {
    const error = new Error("Invalid public lead submission");
    error.code = "validation_error";
    throw error;
  }

  return {
    organization,
    email,
    direction,
    stage,
    message,
    source: "company-site",
    submittedAt: now.toISOString()
  };
}

export function publicLeadRoutes(state, options = {}) {
  const router = Router();
  const nowFn = options.nowFn || (() => new Date());

  router.post("/api/public/leads", async (req, res) => {
    let lead;
    try {
      lead = normalizePublicLeadSubmission(req.body ?? {}, nowFn());
    } catch (error) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const sink = options.sink || state.publicLeads?.sink;
    if (sink) {
      try {
        await sink(lead);
      } catch (error) {
        res.status(503).json({ error: "lead_sink_unavailable" });
        return;
      }
    }

    res.status(202).json({ ok: true, status: "accepted" });
  });

  return router;
}
