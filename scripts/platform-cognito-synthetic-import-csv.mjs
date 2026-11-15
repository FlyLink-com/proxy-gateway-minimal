import { chmod, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { buildSyntheticCognitoImportCsv } from "../server/services/platform/portal-cognito-scrypt-import-rehearsal.mjs";

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--template-csv", "--output"].includes(flag) || typeof value !== "string" || !value || result[flag]) {
      throw new Error("usage: node scripts/platform-cognito-synthetic-import-csv.mjs --template-csv <downloaded-template.csv> --output <temp-output.csv>");
    }
    result[flag] = value;
  }
  if (Object.keys(result).length !== 2) {
    throw new Error("usage: node scripts/platform-cognito-synthetic-import-csv.mjs --template-csv <downloaded-template.csv> --output <temp-output.csv>");
  }
  return result;
}

function assertPathInside(root, candidate) {
  const relativePath = relative(root, candidate);
  if (!relativePath || relativePath === "." || relativePath === ".."
    || relativePath.startsWith(".." + sep) || isAbsolute(relativePath)) {
    throw new Error("synthetic_csv_output_must_be_a_new_file_below_system_temp");
  }
}

const args = parseArguments(process.argv.slice(2));
const templatePath = resolve(args["--template-csv"]);
const outputPath = resolve(args["--output"]);
if (templatePath === outputPath) {
  throw new Error("synthetic_csv_output_must_not_overwrite_template");
}

const tempRoot = await realpath(tmpdir());
const outputParent = await realpath(dirname(outputPath));
assertPathInside(tempRoot, outputParent);
assertPathInside(tempRoot, outputPath);

const template = await readFile(templatePath, "utf8");
if (!template || template.charCodeAt(0) === 0xfeff) {
  throw new Error("cognito_template_header_missing_or_bom_present");
}
const headerLine = template.split(/\r?\n/u, 1)[0];
if (!headerLine || headerLine.includes('"')) {
  throw new Error("cognito_template_header_format_unsupported");
}
const header = headerLine.split(",");
const csv = buildSyntheticCognitoImportCsv(header);

try {
  await writeFile(outputPath, csv, { encoding: "utf8", mode: 0o600, flag: "wx" });
  if (process.platform !== "win32") {
    await chmod(outputPath, 0o600);
    const outputStat = await stat(outputPath);
    if ((outputStat.mode & 0o077) !== 0) {
      throw new Error("synthetic_csv_file_permissions_not_private");
    }
  }
} catch (error) {
  await unlink(outputPath).catch(() => {});
  throw error;
}

process.stdout.write("SYNTHETIC_COGNITO_CSV_CREATED rows=1 bytes=" + Buffer.byteLength(csv, "utf8") + "\n");
