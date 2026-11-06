// Bearer-token gates for the protected endpoints.
//
// Two separate tokens, one per privilege level, so a read credential can
// never write and a write credential can never read:
//   reads  -> CONTROL_PLANE_READ_TOKEN
//   writes -> CONTROL_PLANE_WRITE_TOKEN
//
// Both checks are fail-closed: when the variable is not configured
// (missing, non-string, or empty) every request for that privilege level
// is rejected, including requests that present some token. Comparison
// runs over SHA-256 digests so it is constant-time with respect to the
// token contents and does not leak length information through timing.

async function sha256(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return new Uint8Array(digest);
}

async function tokenMatches(request, expected) {
  if (typeof expected !== "string" || expected.length === 0) return false;
  const header = request.headers.get("authorization");
  if (typeof header !== "string") return false;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  if (!match) return false;
  const [presentedDigest, expectedDigest] = await Promise.all([
    sha256(match[1]),
    sha256(expected),
  ]);
  let diff = 0;
  for (let i = 0; i < presentedDigest.length; i += 1) {
    diff |= presentedDigest[i] ^ expectedDigest[i];
  }
  return diff === 0;
}

export async function isAuthorized(request, env) {
  return tokenMatches(request, env ? env.CONTROL_PLANE_READ_TOKEN : undefined);
}

export async function isWriteAuthorized(request, env) {
  return tokenMatches(request, env ? env.CONTROL_PLANE_WRITE_TOKEN : undefined);
}
