#!/usr/bin/env bash
# One-use physical acceptance, after pinned public binary preparation. No sudo,
# apt, systemd, public listeners, production state, or host process termination.
set -Eeuo pipefail
umask 077
die() { printf 'data-pack WSL execution stopped: %s\n' "$1" >&2; exit 1; }
if [[ ${1:-} == --self-check ]]; then
  [[ $# == 1 ]] || die 'self-check takes no other arguments'
  printf 'driver_self_check=passed; physical_execution=not_started\n'
  exit 0
fi
[[ $# == 5 ]] || die 'requires run_dir gate_file gate_sha source_commit receipt_dir'
RUN_DIR=$1; GATE_FILE=$2; GATE_SHA=$3; SOURCE_COMMIT=$4; RECEIPT_DIR=$5
[[ $RUN_DIR =~ ^/tmp/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$
  && $GATE_FILE =~ ^/tmp/gccgw-data-pack-wsl-gate\.[A-Za-z0-9]{8}\.json$
  && $RECEIPT_DIR =~ ^/tmp/gccgw-data-pack-wsl-receipt\.[A-Za-z0-9]{8}$
  && $GATE_SHA =~ ^[0-9a-f]{64}$ && $SOURCE_COMMIT =~ ^[0-9a-f]{40}$ ]] || die 'invalid fixed scope'
[[ $(uname -s) == Linux && $(uname -m) == x86_64 && $(id -u) != 0 ]] || die 'requires unprivileged Linux x64'
for tool in realpath sha256sum tar python3 timeout unshare mount ip openssl readlink stat cp chmod bash; do
  command -v "$tool" >/dev/null || die "missing tool: $tool"
done
python3 - "$RUN_DIR" "$GATE_FILE" "$RECEIPT_DIR" "$GATE_SHA" "$SOURCE_COMMIT" <<'PY' || die 'private input or exact gate mismatch'
import hashlib, json, os, stat, sys
from datetime import datetime, timezone
run, gate_path, receipt, digest, commit = sys.argv[1:]
for path, directory in [(run, True), (gate_path, False), (receipt, True)]:
    info = os.lstat(path)
    if (os.path.realpath(path) != path or info.st_uid != os.getuid()
            or info.st_mode & 0o077 or stat.S_ISLNK(info.st_mode)
            or (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)) is not True):
        raise SystemExit(1)
with open(gate_path, 'rb') as source: raw = source.read(65537)
if len(raw) > 65536 or hashlib.sha256(raw).hexdigest() != digest: raise SystemExit(1)
gate = json.loads(raw)
expires = datetime.fromisoformat(gate['expiresAt'].replace('Z', '+00:00'))
if gate['sourceCommit'] != commit or expires <= datetime.now(timezone.utc): raise SystemExit(1)
if gate['nodeSha256'] != '9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578': raise SystemExit(1)
if gate['hysteriaSha256'] != '66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1': raise SystemExit(1)
if os.listdir(receipt): raise SystemExit(1)
for name, expected in gate['files'].items():
    if name.startswith('/') or '..' in name.split('/'): raise SystemExit(1)
    path = os.path.join(run, 'source', name)
    if os.path.realpath(path) != path or not stat.S_ISREG(os.lstat(path).st_mode): raise SystemExit(1)
    with open(path, 'rb') as source: actual = hashlib.sha256(source.read()).hexdigest()
    if actual != expected: raise SystemExit(1)
for name, expected in [('node-v22.23.1-linux-x64.tar.xz', gate['nodeSha256']),
                       ('hysteria-linux-amd64', gate['hysteriaSha256']),
                       ('node-modules.tar', gate['dependencySha256']),
                       ('dependency-artifact.json', gate['dependencyManifestSha256']),
                       ('source.tar', gate['sourceArchiveSha256']),
                       ('source-tree.json', gate['sourceTreeSha256'])]:
    path = os.path.join(run, name)
    if os.path.realpath(path) != path or not stat.S_ISREG(os.lstat(path).st_mode): raise SystemExit(1)
    with open(path, 'rb') as source: actual = hashlib.sha256(source.read()).hexdigest()
    if actual != expected: raise SystemExit(1)
PY
[[ $(sha256sum "${BASH_SOURCE[0]}" | cut -d ' ' -f 1) == \
  $(sha256sum "$RUN_DIR/source/scripts/data-pack-wsl-acceptance.sh" | cut -d ' ' -f 1) ]] \
  || die 'running driver differs from exported pinned driver'
mkdir "$GATE_FILE.consumed" || die 'one-time gate already consumed; do not replay'
stage=runtime_admission
child_started=0
success=0
finish() {
  local original_exit=$? resolved retention_ok=1 cleanup_ok=0
  set +e
  trap - EXIT
  # The pid namespace kills its remaining descendants when its init exits.
  # Preserve only aggregate receipts. npm/raw process output never leaves run_dir.
  if [[ -f $RUN_DIR/physical-receipt.json && ! -L $RUN_DIR/physical-receipt.json ]]; then
    cp -- "$RUN_DIR/physical-receipt.json" "$RECEIPT_DIR/physical-receipt.json" || retention_ok=0
  fi
  python3 - "$RECEIPT_DIR/driver-receipt.json" "$SOURCE_COMMIT" "$stage" "$success" "$child_started" <<'PY'
import json, sys
from datetime import datetime, timezone
path, commit, stage, success, started = sys.argv[1:]
with open(path, 'x', encoding='utf-8') as output:
    json.dump({'sourceCommit': commit, 'finishedAt': datetime.now(timezone.utc).isoformat(),
        'stage': stage, 'outcome': 'failed',
        'namespaceAttempted': started == '1', 'productionChanged': False,
        'cleanupVerified': False}, output, sort_keys=True, indent=2)
PY
  [[ $? == 0 ]] || retention_ok=0
  # If receipt retention failed, preserve the private fixture for evidence;
  # report failure instead of silently deleting its only receipt/material.
  if [[ $retention_ok == 1 && -d $RUN_DIR && ! -L $RUN_DIR ]]; then
    resolved=$(realpath -e -- "$RUN_DIR")
    if [[ $? == 0 && $resolved == "$RUN_DIR" && $resolved =~ ^/tmp/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$ ]]; then
      rm -rf -- "$resolved"
      [[ $? == 0 && ! -e $RUN_DIR ]] && cleanup_ok=1
    fi
  fi
  if [[ $retention_ok == 1 ]]; then
    python3 - "$RECEIPT_DIR/driver-receipt.json" "$cleanup_ok" "$success" "$original_exit" <<'PY'
import json, sys
path, cleanup, success, original_exit = sys.argv[1:]
with open(path, encoding='utf-8') as source: receipt = json.load(source)
receipt['cleanupVerified'] = cleanup == '1'
receipt['outcome'] = 'passed' if cleanup == '1' and success == '1' and original_exit == '0' else 'failed'
with open(path, 'w', encoding='utf-8') as output: json.dump(receipt, output, sort_keys=True, indent=2)
PY
    [[ $? == 0 ]] || retention_ok=0
  fi
  if [[ $retention_ok != 1 || $cleanup_ok != 1 || $original_exit != 0 || $success != 1 ]]; then
    printf 'outcome=failed; receipt_retained=%s; private_fixture_removed=%s; production_changed=false\n' "$retention_ok" "$cleanup_ok"
    exit 1
  fi
  printf 'receipt_dir=%s; outcome=passed; production_changed=false\n' "$RECEIPT_DIR"
  exit 0
}
trap finish EXIT
mkdir "$RUN_DIR/node"
tar -xJf "$RUN_DIR/node-v22.23.1-linux-x64.tar.xz" --strip-components=1 -C "$RUN_DIR/node"
chmod 700 "$RUN_DIR/hysteria-linux-amd64"
NODE="$RUN_DIR/node/bin/node"
ENTRY="$RUN_DIR/source/scripts/data-pack-wsl-acceptance.mjs"
env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C "$NODE" "$ENTRY" --admit "$RUN_DIR" "$GATE_FILE" "$SOURCE_COMMIT" "$GATE_SHA" \
  >/dev/null 2>&1 || die 'entry admission failed'
stage=certificate
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 \
  -addext subjectAltName=IP:127.0.0.1 -keyout "$RUN_DIR/loopback.key" -out "$RUN_DIR/loopback.crt" \
  >/dev/null 2>&1 || die 'private loopback certificate creation failed'
chmod 600 "$RUN_DIR/loopback.key" "$RUN_DIR/loopback.crt"
cp -- "$GATE_FILE" "$RUN_DIR/approved-gate.json"
[[ $(sha256sum "$RUN_DIR/approved-gate.json" | cut -d ' ' -f 1) == "$GATE_SHA" ]] || die 'approved gate changed before namespace entry'
PARENT_NS=$(python3 - "$$" <<'PY'
import json, os, sys
pid = sys.argv[1]
print(json.dumps({name: os.readlink(f'/proc/{pid}/ns/{name}') for name in ['user', 'mnt', 'net', 'pid']}))
PY
)
stage=physical
child_started=1
RUN_ID=$(stat -c '%d:%i' -- "$RUN_DIR")
timeout --signal=TERM --kill-after=15s 180s env -i \
  PATH=/usr/sbin:/usr/bin:/sbin:/bin LANG=C TZ=UTC GCCGW_PARENT_NS="$PARENT_NS" GCCGW_PARENT_RUN_ID="$RUN_ID" \
  unshare --user --map-root-user --mount --net --pid --fork --mount-proc \
  bash -c 'set -Eeuo pipefail; mount --make-rprivate /; exec 3<"$1"; mount -t tmpfs -o size=256m,mode=0755 tmpfs /tmp; mkdir "$1"; mount --no-canonicalize --bind /proc/self/fd/3 "$1"; exec 3<&-; mount -t tmpfs -o size=1m,mode=000 tmpfs /mnt; mount -t tmpfs -o size=1m,mode=000 tmpfs /home; mount -t tmpfs -o size=1m,mode=000 tmpfs /root; mount -t sysfs -o ro,nosuid,nodev,noexec sysfs /sys; ip link set lo up; cd "$1/source"; exec "$1/node/bin/node" "$1/source/scripts/data-pack-wsl-acceptance.mjs" --execute "$1" "$1/approved-gate.json" "$2" "$3"' \
  acceptance-child "$RUN_DIR" "$SOURCE_COMMIT" "$GATE_SHA" >"$RUN_DIR/physical-private.log" 2>&1 \
  || die 'isolated physical acceptance failed or timed out'
stage=receipt
python3 - "$RUN_DIR/physical-receipt.json" <<'PY' || die 'physical receipt did not pass'
import json, sys
with open(sys.argv[1], encoding='utf-8') as source: receipt = json.load(source)
if (receipt['outcome'] != 'passed' or receipt['namespaceVerified'] is not True
        or receipt['cleanupVerified'] is not True or receipt['productionChanged'] is not False): raise SystemExit(1)
PY
success=1
