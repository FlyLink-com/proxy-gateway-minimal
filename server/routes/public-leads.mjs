import { Router } from "express";
import { normalizePlatformLead } from "../services/platform/control-plane-contract.mjs";

function publicLeadFields(payload = {}) {
  return {
    organization: payload?.organization,
    email: payload?.email,
    direction: payload?.direction,
    stage: payload?.stage,
    message: payload?.message
  };
}

export function normalizePublicLeadSubmission(payload, now = new Date()) {
  const timestamp = now instanceof Date ? now : new Date(now);
  const lead = normalizePlatformLead(publicLeadFields(payload), {
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
    const leadQueue = options.leadQueue || state.platform?.leadQueue;
    if (leadQueue) {
      try {
        leadQueue.enqueueLead(publicLeadFields(req.body));
      } catch (error) {
        if (error?.code === "validation_error") {
          res.status(400).json({ error: "validation_error" });
          return;
        }
        res.status(503).json({ error: "lead_sink_unavailable" });
        return;
      }
      res.status(202).json({ ok: true, status: "accepted" });
      return;
    }

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
