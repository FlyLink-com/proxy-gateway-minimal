#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const targetDir = path.resolve(process.cwd(), process.argv[2] ?? "admin/dist-site");
const indexPath = path.join(targetDir, "index.html");

if (!existsSync(indexPath)) {
  throw new Error(`public site build is missing index.html: ${indexPath}`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    return stat.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const filesToScan = walk(targetDir).filter((file) => /\.(html|js|svg)$/i.test(file));
const combined = filesToScan.map((file) => readFileSync(file, "utf8")).join("\n");

const requiredPatterns = [
  /GCC WebOS/,
  /company-site-shell/,
  /gccwebos-public-site/,
  /Connect to the world\. Start with ease\./,
  /Find what fits your next step/,
  /Start a conversation with GCC WebOS/,
  /连接世界，也连接每一次开始/,
  /找到适合你的开始方式/
];

const forbiddenPatterns = [
  /GlobalCircle AI/,
  /Admin Console/i,
  /Subscription Admin/i,
  /Admin API/i,
  /\/api\/admin/i,
  /#\/portal/i,
  /UserPortalPage/,
  /ConnectionPanel/,
  /SubscriptionsPage/,
  /NodesPage/,
  /OverviewPage/,
  /Console token/i,
  /proxy-gateway-admin/i,
  /Telegram/i,
  /(?:https?:\/\/)?t\.me\//i,
  /gcaltd0528/i,
  /Protocol: WireGuard/i,
  /Tokyo · JP/i,
  /Start 7-day trial/i,
  /¥(?:20|30|200)/i
];

const missing = requiredPatterns.filter((pattern) => !pattern.test(combined));
if (missing.length > 0) {
  throw new Error(
    `public site build is missing expected public-site markers: ${missing
      .map((pattern) => pattern.toString())
      .join(", ")}`
  );
}

const forbidden = forbiddenPatterns.filter((pattern) => pattern.test(combined));
if (forbidden.length > 0) {
  throw new Error(
    `public site build exposes forbidden admin/portal/private markers: ${forbidden
      .map((pattern) => pattern.toString())
      .join(", ")}`
  );
}

console.log(`public site build boundary ok: ${targetDir}`);
