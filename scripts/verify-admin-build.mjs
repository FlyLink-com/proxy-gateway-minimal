import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_RUNTIME_MARKERS = [
  "Admin Console",
  "/api/admin/overview",
  "/api/admin/platform/subscription-usage-monitor"
];

const PRIVATE_KEY_MARKERS = [
  "-----BEGIN PRIVATE KEY-----",
  "-----BEGIN ENCRYPTED PRIVATE KEY-----",
  "-----BEGIN RSA PRIVATE KEY-----",
  "-----BEGIN EC PRIVATE KEY-----",
  "-----BEGIN DSA PRIVATE KEY-----",
  "-----BEGIN OPENSSH PRIVATE KEY-----",
  "-----BEGIN PGP PRIVATE KEY BLOCK-----"
];

const PRIVATE_KEY_CONTAINER_EXTENSIONS = new Set([
  ".der",
  ".key",
  ".p12",
  ".pem",
  ".pfx"
]);

const SOURCE_MAP_DIRECTIVE = /(?:\/\/[#@]|\/\*[#@])\s*sourceMappingURL\s*=/i;

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }

  return files;
}

function relativeBuildPath(rootDirectory, filePath) {
  return path.relative(rootDirectory, filePath).replaceAll(path.sep, "/");
}

export async function verifyAdminBuildDirectory(buildDirectory) {
  const rootStat = await stat(buildDirectory);
  if (!rootStat.isDirectory()) {
    throw new Error("admin build path is not a directory");
  }

  const files = await listFiles(buildDirectory);
  const relativeFiles = files.map((file) => relativeBuildPath(buildDirectory, file));

  if (!relativeFiles.includes("index.html")) {
    throw new Error("admin build is missing index.html");
  }
  if (!relativeFiles.some((file) => file.endsWith(".js"))) {
    throw new Error("admin build is missing JavaScript assets");
  }
  if (!relativeFiles.some((file) => file.endsWith(".css"))) {
    throw new Error("admin build is missing CSS assets");
  }

  const privateKeyContainer = relativeFiles.find((file) =>
    PRIVATE_KEY_CONTAINER_EXTENSIONS.has(path.posix.extname(file).toLowerCase())
  );
  if (privateKeyContainer) {
    throw new Error(`admin build contains private key container: ${privateKeyContainer}`);
  }

  const sourceMap = relativeFiles.find((file) => file.toLowerCase().endsWith(".map"));
  if (sourceMap) {
    throw new Error(`admin build contains source map: ${sourceMap}`);
  }

  for (const file of files) {
    const content = await readFile(file);
    const privateKeyMarker = PRIVATE_KEY_MARKERS.find((marker) => content.includes(marker));
    if (privateKeyMarker) {
      throw new Error(`private key marker found in ${relativeBuildPath(buildDirectory, file)}`);
    }
    if (/\.(?:js|css)$/i.test(file) && SOURCE_MAP_DIRECTIVE.test(content.toString("utf8"))) {
      throw new Error(`source map directive found in ${relativeBuildPath(buildDirectory, file)}`);
    }
  }

  const runtimeContent = (await Promise.all(files
    .filter((file) => /\.(?:html|js)$/i.test(file))
    .map((file) => readFile(file, "utf8")))).join("\n");
  for (const marker of REQUIRED_RUNTIME_MARKERS) {
    if (!runtimeContent.includes(marker)) {
      throw new Error(`admin runtime marker missing: ${marker}`);
    }
  }

  return {
    status: "ok",
    files: relativeFiles.length,
    safety: {
      hasAdminApiContract: true,
      noPrivateKeyMaterial: true,
      noSourceMaps: true
    }
  };
}

async function main() {
  const buildDirectory = process.argv[2];
  if (!buildDirectory) {
    throw new Error("usage: node scripts/verify-admin-build.mjs <build-dir>");
  }

  const summary = await verifyAdminBuildDirectory(path.resolve(buildDirectory));
  console.log(JSON.stringify(summary, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
