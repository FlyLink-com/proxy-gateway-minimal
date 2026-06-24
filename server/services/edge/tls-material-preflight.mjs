const SAFE_REF_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  return value === true;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRef(value, fallback = "") {
  const normalized = text(value);
  return SAFE_REF_PATTERN.test(normalized) ? normalized : fallback;
}

function normalizePath(value) {
  return text(value).replace(/\\/g, "/").replace(/\/+$/g, "");
}

function pathInsideRoot(pathValue, rootValue) {
  const path = normalizePath(pathValue);
  const root = normalizePath(rootValue);
  return Boolean(path && root && (path === root || path.startsWith(`${root}/`)));
}

function defaultSafePathRoots(runtime) {
  if (runtime === "mihomo-tuic") {
    return ["/etc/mihomo"];
  }
  return [];
}

function wildcardHostMatches(pattern, host) {
  const normalizedPattern = text(pattern).toLowerCase();
  const normalizedHost = text(host).toLowerCase();
  if (!normalizedPattern || !normalizedHost) {
    return false;
  }
  if (normalizedPattern === normalizedHost) {
    return true;
  }
  if (!normalizedPattern.startsWith("*.")) {
    return false;
  }
  const suffix = normalizedPattern.slice(1);
  if (!normalizedHost.endsWith(suffix) || normalizedHost.length <= suffix.length) {
    return false;
  }
  const wildcardLabel = normalizedHost.slice(0, -suffix.length);
  return Boolean(wildcardLabel) && !wildcardLabel.includes(".");
}

function certificateCoversHost(certificate = {}, host) {
  if (certificate.coversHost === true) {
    return true;
  }
  const names = [
    ...(Array.isArray(certificate.dnsNames) ? certificate.dnsNames : []),
    ...(Array.isArray(certificate.subjectAltNames) ? certificate.subjectAltNames : []),
    ...(Array.isArray(certificate.sans) ? certificate.sans : [])
  ];
  return names.some((name) => wildcardHostMatches(name, host));
}

function blocker(code, scope = {}) {
  return { code, ...scope };
}

function check(ok, required = true, details = {}) {
  return { ok, required, ...details };
}

function materialPath(source = {}, key) {
  if (!isPlainObject(source)) {
    return "";
  }
  if (key === "certificate") {
    return normalizePath(source.certificate ?? source.certificatePath ?? source.cert);
  }
  return normalizePath(source.privateKey ?? source.privateKeyPath ?? source.key);
}

function pathPairMatches(listenerPath, sourcePath) {
  return !sourcePath || normalizePath(listenerPath) === sourcePath;
}

export function buildTlsMaterialPreflightReport({
  runtime,
  channelRef,
  host,
  sni,
  listener = {},
  safePathRoots,
  requireSafeRuntimeCopy = false,
  certificate = {},
  fileAccess = {},
  materialSource = {}
} = {}) {
  const safeRuntime = safeRef(runtime, "unknown");
  const safeChannelRef = safeRef(channelRef, "unknown");
  const targetHost = text(host || sni);
  const certificatePath = materialPath(listener, "certificate");
  const privateKeyPath = materialPath(listener, "privateKey");
  const roots = Array.isArray(safePathRoots)
    ? safePathRoots.map(normalizePath).filter(Boolean)
    : defaultSafePathRoots(safeRuntime);
  const enforceSafePath = safeRuntime === "mihomo-tuic" || bool(requireSafeRuntimeCopy) || roots.length > 0;
  const sourceCertificatePath = materialPath(materialSource, "certificate");
  const sourcePrivateKeyPath = materialPath(materialSource, "privateKey");
  const hasMaterialSource = Boolean(sourceCertificatePath || sourcePrivateKeyPath);
  const blockers = [];

  if (!certificatePath) {
    blockers.push(blocker("missing_certificate_path", { field: "certificate" }));
  }
  if (!privateKeyPath) {
    blockers.push(blocker("missing_private_key_path", { field: "privateKey" }));
  }
  if (!targetHost) {
    blockers.push(blocker("missing_target_host", { field: "host" }));
  }
  if (targetHost && !certificateCoversHost(certificate, targetHost)) {
    blockers.push(blocker("certificate_host_mismatch"));
  }
  if (certificate.keyPairMatches !== true) {
    blockers.push(blocker("certificate_key_pair_unverified"));
  }
  if (fileAccess.certificateReadableByService !== true) {
    blockers.push(blocker("certificate_not_readable_by_service"));
  }
  if (fileAccess.privateKeyReadableByService !== true) {
    blockers.push(blocker("private_key_not_readable_by_service"));
  }

  const certificateInSafeRoot = !enforceSafePath || roots.some((root) => pathInsideRoot(certificatePath, root));
  const privateKeyInSafeRoot = !enforceSafePath || roots.some((root) => pathInsideRoot(privateKeyPath, root));
  if (certificatePath && !certificateInSafeRoot) {
    blockers.push(blocker("certificate_outside_safe_path", { runtime: safeRuntime }));
  }
  if (privateKeyPath && !privateKeyInSafeRoot) {
    blockers.push(blocker("private_key_outside_safe_path", { runtime: safeRuntime }));
  }

  const materialSourceMatches = !hasMaterialSource
    || (pathPairMatches(certificatePath, sourceCertificatePath) && pathPairMatches(privateKeyPath, sourcePrivateKeyPath));
  if (!materialSourceMatches) {
    blockers.push(blocker("runtime_material_source_drift"));
  }

  const checks = {
    certificatePathPresent: check(Boolean(certificatePath)),
    privateKeyPathPresent: check(Boolean(privateKeyPath)),
    certificateCoversHost: check(Boolean(targetHost) && certificateCoversHost(certificate, targetHost)),
    keyPairMatches: check(certificate.keyPairMatches === true),
    serviceReadable: check(
      fileAccess.certificateReadableByService === true && fileAccess.privateKeyReadableByService === true
    ),
    safePathPolicy: check(certificateInSafeRoot && privateKeyInSafeRoot, true, {
      enforced: enforceSafePath,
      safeRootCount: roots.length
    }),
    materialSourceParity: check(materialSourceMatches, hasMaterialSource, {
      status: hasMaterialSource ? (materialSourceMatches ? "matched" : "drift") : "not_provided"
    })
  };
  const ok = blockers.length === 0 && Object.values(checks).every((item) => item.ok === true);

  return {
    type: "gccgw_edge_tls_material_preflight",
    generatedBy: "gccgw edge tls-material preflight",
    ok,
    status: ok ? "ready" : "blocked",
    riskTier: "B",
    mutation: false,
    productionAuthority: false,
    runtime: safeRuntime,
    channelRef: safeChannelRef,
    host: targetHost || undefined,
    checks,
    summary: {
      certificatePathPresent: Boolean(certificatePath),
      privateKeyPathPresent: Boolean(privateKeyPath),
      safePathEnforced: enforceSafePath,
      safeRootCount: roots.length,
      materialSourceParity: checks.materialSourceParity.status,
      blockerCount: blockers.length
    },
    blockers,
    redacted: true
  };
}
