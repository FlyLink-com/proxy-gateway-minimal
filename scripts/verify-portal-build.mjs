import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ADMIN_SHELL_MARKERS = [
  "AdminLayout",
  "Open user portal",
  "Portal Requests",
  "ConnectionPanel",
  "SubscriptionsPage",
  "ProvisioningPage"
];

const SECRET_MARKERS = [
  "SS_PASSWORD",
  "consoleToken",
  "https://sub.example.test",
  "pgtmp_",
  "pgart_",
  "private_key",
  "BEGIN PRIVATE KEY"
];

const REQUIRED_RUNTIME_MARKERS = [
  "/portal/register",
  "/api/portal/human-challenges",
  "/api/portal/password/session",
  "/api/portal/registration",
  "/api/portal/registration/email-verification",
  "/api/portal/coins/recharge/offers",
  "/api/portal/coins/recharge/orders"
];

const REQUIRED_COMMERCE_LAYOUT_MARKERS = [
  { marker: "portal-commerce-layout", markup: true, css: true },
  { marker: "portal-wallet-nav-balance", markup: true, css: false },
  { marker: "portal-v2-global-search-form", markup: true, css: true },
  { marker: "portal-v2-settings-preference-grid", markup: true, css: true },
  { marker: "portal-recharge-dialog", markup: true, css: true }
];

const FORBIDDEN_COMMERCE_LAYOUT_MARKERS = [
  "portal-recharge-entry",
  "portal-recharge-denominations",
  "portal-wallet-recharge-note"
];

const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function codePointOrder(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalidRechargeConfigIdentity() {
  throw new Error("portal recharge config identity invalid");
}

function unsafeActionHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized.endsWith(".")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized)
    || (normalized.startsWith("[") && normalized.endsWith("]"));
}

function verifyRechargeConfigIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidRechargeConfigIdentity();
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== 3
    || !keys.every((key) => typeof key === "string"
      && ["schemaVersion", "sha256", "trustedActionOriginsByAdapter"].includes(key))
    || value.schemaVersion !== "1"
    || !/^[0-9a-f]{64}$/u.test(value.sha256)
  ) return invalidRechargeConfigIdentity();
  const configured = value.trustedActionOriginsByAdapter;
  if (
    !configured
    || typeof configured !== "object"
    || Array.isArray(configured)
    || Object.getPrototypeOf(configured) !== Object.prototype
    || Object.hasOwn(configured, "paypal_v1")
  ) return invalidRechargeConfigIdentity();
  const normalized = {};
  for (const adapterKey of Object.keys(configured).sort(codePointOrder)) {
    const origins = configured[adapterKey];
    if (!REFERENCE.test(adapterKey) || !Array.isArray(origins)) {
      return invalidRechargeConfigIdentity();
    }
    const normalizedOrigins = [];
    for (const origin of origins) {
      if (typeof origin !== "string" || /[^\x20-\x7e]/u.test(origin)) {
        return invalidRechargeConfigIdentity();
      }
      let url;
      try { url = new URL(origin); } catch { return invalidRechargeConfigIdentity(); }
      if (
        url.protocol !== "https:"
        || url.origin !== origin
        || url.username !== ""
        || url.password !== ""
        || unsafeActionHost(url.hostname)
      ) return invalidRechargeConfigIdentity();
      normalizedOrigins.push(origin);
    }
    normalizedOrigins.sort(codePointOrder);
    if (new Set(normalizedOrigins).size !== normalizedOrigins.length) {
      return invalidRechargeConfigIdentity();
    }
    normalized[adapterKey] = normalizedOrigins;
  }
  const canonical = JSON.stringify(normalized);
  const sha256 = createHash("sha256").update(canonical).digest("hex");
  if (sha256 !== value.sha256) return invalidRechargeConfigIdentity();
  return {
    runtimeBinding: [
      "portal-recharge-config-v1",
      sha256,
      Buffer.from(canonical, "utf8").toString("base64")
    ].join("."),
    summary: {
      sha256,
      configuredAdapters: Object.keys(normalized)
    }
  };
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function relativeBuildPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll(path.sep, "/");
}

function assertNoMarkers({
  content,
  file,
  markers,
  type
}) {
  const marker = markers.find((candidate) => content.includes(candidate));
  if (marker) {
    throw new Error(`${type} marker found in ${file}`);
  }
}

export async function verifyPortalBuildDirectory(buildDir) {
  const rootStat = await stat(buildDir);
  if (!rootStat.isDirectory()) {
    throw new Error("portal build path is not a directory");
  }

  const files = await listFiles(buildDir);
  const relativeFiles = files.map((file) => relativeBuildPath(buildDir, file));
  if (!relativeFiles.includes("index.html")) {
    throw new Error("portal build is missing index.html");
  }
  if (!relativeFiles.some((file) => file.endsWith(".js"))) {
    throw new Error("portal build is missing JavaScript assets");
  }
  if (!relativeFiles.some((file) => file.endsWith(".css"))) {
    throw new Error("portal build is missing CSS assets");
  }
  const rechargeConfigFile = files.find((file) => (
    relativeBuildPath(buildDir, file) === "portal-recharge-config.json"
  ));
  if (!rechargeConfigFile) {
    throw new Error("portal recharge config identity missing");
  }
  let rechargeConfigIdentity;
  try {
    rechargeConfigIdentity = verifyRechargeConfigIdentity(JSON.parse(
      await readFile(rechargeConfigFile, "utf8")
    ));
  } catch (error) {
    if (error instanceof Error && error.message === "portal recharge config identity invalid") {
      throw error;
    }
    return invalidRechargeConfigIdentity();
  }

  for (const file of files) {
    if (!/\.(html|js|css|svg|json|txt)$/i.test(file)) continue;
    const relative = relativeBuildPath(buildDir, file);
    const content = await readFile(file, "utf8");
    assertNoMarkers({
      content,
      file: relative,
      markers: ADMIN_SHELL_MARKERS,
      type: "admin shell"
    });
    assertNoMarkers({
      content,
      file: relative,
      markers: SECRET_MARKERS,
      type: "secret"
    });
  }

  const runtimeContent = (await Promise.all(files
    .filter((file) => /\.(html|js)$/i.test(file))
    .map((file) => readFile(file, "utf8")))).join("\n");
  if (!runtimeContent.includes(rechargeConfigIdentity.runtimeBinding)) {
    throw new Error("portal recharge config runtime binding missing");
  }
  for (const marker of REQUIRED_RUNTIME_MARKERS) {
    if (!runtimeContent.includes(marker)) {
      throw new Error(`portal runtime marker missing: ${marker}`);
    }
  }

  const commerceMarkupContent = (await Promise.all(files
    .filter((file) => /\.(html|js)$/i.test(file))
    .map((file) => readFile(file, "utf8")))).join("\n");
  const commerceCssContent = (await Promise.all(files
    .filter((file) => /\.css$/i.test(file))
    .map((file) => readFile(file, "utf8")))).join("\n");
  const forbiddenCommerceContent = `${commerceMarkupContent}\n${commerceCssContent}`;
  const forbiddenCommerceMarker = FORBIDDEN_COMMERCE_LAYOUT_MARKERS
    .find((marker) => forbiddenCommerceContent.includes(marker));
  if (forbiddenCommerceMarker) {
    throw new Error(
      `portal forbidden commerce marker found: ${forbiddenCommerceMarker}`
    );
  }
  for (const { marker, markup, css } of REQUIRED_COMMERCE_LAYOUT_MARKERS) {
    const missingAssetClasses = [
      markup && !commerceMarkupContent.includes(marker) && "HTML/JavaScript",
      css && !commerceCssContent.includes(marker) && "CSS"
    ].filter(Boolean);
    if (missingAssetClasses.length > 0) {
      throw new Error(`portal commerce layout marker missing: ${marker} (${missingAssetClasses.join(", ")})`);
    }
  }

  return {
    status: "ok",
    files: relativeFiles.length,
    safety: {
      noAdminShellMarkers: true,
      noSecretMaterial: true,
      hasPortalHumanChallengeContract: true,
      hasPortalRegistrationContract: true,
      hasCommerceLayoutContract: true,
      hasProtectedRechargeContract: true,
      hasRechargeConfigIdentity: true
    },
    rechargeConfigIdentity: rechargeConfigIdentity.summary
  };
}

async function main() {
  const buildDir = process.argv[2];
  if (!buildDir) {
    throw new Error("usage: node scripts/verify-portal-build.mjs <build-dir>");
  }
  const summary = await verifyPortalBuildDirectory(path.resolve(buildDir));
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
