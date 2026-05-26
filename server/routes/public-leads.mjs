import { Router } from "express";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";

export function normalizePublicLeadSubmission(payload, now = new Date()) {
  const timestamp = now instanceof Date ? now : new Date(now);
  const lead = normalizePlatformLead(payload, {
    now: timestamp,
    idFactory: () => `lead_${timestamp.getTime().toString(36)}`
  });
  return {
    ...lead,
    submittedAt: lead.createdAt
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
