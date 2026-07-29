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
  "/api/portal/registration/email-verification"
];

const REQUIRED_COMMERCE_LAYOUT_MARKERS = [
  "portal-commerce-layout",
  "portal-coins-wallet-entry"
];

const FORBIDDEN_COMMERCE_LAYOUT_MARKERS = [
  "portal-recharge-dialog",
  "portal-recharge-entry",
  "portal-recharge-denominations",
  "portal-wallet-recharge-heading",
  "portal-wallet-recharge-note"
];

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
  for (const marker of REQUIRED_COMMERCE_LAYOUT_MARKERS) {
    const missingAssetClasses = [
      !commerceMarkupContent.includes(marker) && "HTML/JavaScript",
      !commerceCssContent.includes(marker) && "CSS"
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
      noRechargeUi: true
    }
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
