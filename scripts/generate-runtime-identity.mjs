#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RUNTIME_IDENTITY_RELEASE_UNITS = Object.freeze([
  "japan-runtime-config",
  "sgp-runtime-config"
]);

const RUNTIME_IDENTITY_RELEASE_UNIT_SET = new Set(RUNTIME_IDENTITY_RELEASE_UNITS);
const COMPONENT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_NAME_MAX_LENGTH = 80;

export function createRuntimeConfigIdentity({
  releaseUnit,
  observedAt,
  components
} = {}) {
  if (!RUNTIME_IDENTITY_RELEASE_UNIT_SET.has(releaseUnit)) {
    throw new Error("runtime_identity_release_unit_invalid");
  }
  const parsedObservedAt = new Date(String(observedAt ?? ""));
  if (Number.isNaN(parsedObservedAt.getTime())) {
    throw new Error("runtime_identity_observed_at_invalid");
  }
  if (!Array.isArray(components) || components.length === 0) {
    throw new Error("runtime_identity_components_invalid");
  }
  const componentNames = new Set();
  for (const component of components) {
    if (
      typeof component?.name !== "string"
      || component.name.length > COMPONENT_NAME_MAX_LENGTH
      || !COMPONENT_NAME_PATTERN.test(component.name)
    ) {
      throw new Error("runtime_identity_component_name_invalid");
    }
    if (componentNames.has(component.name)) {
      throw new Error("runtime_identity_component_duplicate");
    }
    if (!(component.bytes instanceof Uint8Array)) {
      throw new Error("runtime_identity_component_bytes_invalid");
    }
    componentNames.add(component.name);
  }

  return {
    schemaVersion: "1",
    releaseUnit,
    observedAt: parsedObservedAt.toISOString(),
    components: components
      .map(({ name, bytes }) => ({
        name,
        sha256: createHash("sha256").update(bytes).digest("hex")
      }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  };
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const inline = argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : "";
}

function argValues(argv, name) {
  const values = [];
  const prefix = `${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith(prefix)) {
      values.push(argv[index].slice(prefix.length));
    } else if (argv[index] === name) {
      values.push(argv[index + 1] ?? "");
      index += 1;
    }
  }
  return values;
}

function requiredArg(argv, name) {
  const value = String(argValue(argv, name) ?? "").trim();
  if (!value) {
    throw new Error("runtime_identity_argument_missing");
  }
  return value;
}

function componentFromArg(value) {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error("runtime_identity_component_argument_invalid");
  }
  return {
    name: value.slice(0, separator),
    path: value.slice(separator + 1),
    bytes: readFileSync(value.slice(separator + 1))
  };
}

function comparablePath(path) {
  const absolutePath = resolve(path);
  return process.platform === "win32" ? absolutePath.toLowerCase() : absolutePath;
}

export function runRuntimeIdentityCli({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const outputPath = requiredArg(argv, "--output");
    const componentInputs = argValues(argv, "--component").map(componentFromArg);
    if (componentInputs.some((component) => (
      comparablePath(component.path) === comparablePath(outputPath)
    ))) {
      throw new Error("runtime_identity_output_conflicts_with_component");
    }
    const manifest = createRuntimeConfigIdentity({
      releaseUnit: requiredArg(argv, "--release-unit"),
      observedAt: requiredArg(argv, "--observed-at"),
      components: componentInputs.map(({ name, bytes }) => ({ name, bytes }))
    });

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    stdout.write(`${JSON.stringify({
      type: "runtime_identity_generation",
      ok: true,
      releaseUnit: manifest.releaseUnit,
      componentCount: manifest.components.length,
      outputFile: basename(outputPath)
    })}\n`);
    return 0;
  } catch {
    stderr.write(`${JSON.stringify({
      type: "runtime_identity_generation",
      ok: false,
      error: "runtime_identity_generation_failed"
    })}\n`);
    return 1;
  }
}

function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  process.exitCode = runRuntimeIdentityCli();
}
