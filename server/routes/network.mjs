import { Router } from "express";

function parseDoctorResult(result) {
  const stdout = result.stdout || "";
  try {
    return JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      error: "Windows network doctor did not return JSON",
      stdout,
      stderr: result.stderr || "",
      code: result.code,
      timedOut: result.timedOut
    };
  }
}

export function networkRoutes(state) {
  const router = Router();

  router.get("/api/network/status", async (_req, res) => {
    res.json(parseDoctorResult(await state.runCommand("network-status")));
  });

  router.post("/api/network/repair", async (_req, res) => {
    res.json(parseDoctorResult(await state.runCommand("network-repair")));
  });

  router.post("/api/network/reset", async (_req, res) => {
    res.json(parseDoctorResult(await state.runCommand("network-reset")));
  });

  return router;
}
