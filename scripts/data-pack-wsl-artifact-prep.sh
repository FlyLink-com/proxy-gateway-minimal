#!/usr/bin/env bash
# Prepare pinned public binaries for the data-pack WSL acceptance run.
# This script never starts Hysteria, a collector, or an edge process.
set -Eeuo pipefail
umask 077

NODE_VERSION=22.23.1
NODE_ARCHIVE=node-v22.23.1-linux-x64.tar.xz
NODE_SHA256=9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578
HY_VERSION=2.9.3
HY_ASSET=hysteria-linux-amd64
HY_SHA256=66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1
# This is the Git administrative directory of the dedicated #753 worktree,
# translated from its Windows .git pointer for WSL. A moved worktree fails shut.
GIT_DIR=/mnt/d/Projects/proxy-gateway-minimal/.git/worktrees/proxy-gateway-minimal3

die() { printf 'data-pack WSL preparation stopped: %s\n' "$1" >&2; exit 1; }
if [[ ${1:-} == --self-check ]]; then
  [[ $# == 1 ]] || die 'self-check takes no other arguments'
  [[ $NODE_SHA256 =~ ^[0-9a-f]{64}$ && $HY_SHA256 =~ ^[0-9a-f]{64}$ ]] || die 'invalid artifact digest'
  [[ $NODE_ARCHIVE == "node-v${NODE_VERSION}-linux-x64.tar.xz" ]] || die 'Node archive mismatch'
  [[ $HY_ASSET == hysteria-linux-amd64 ]] || die 'Hysteria asset mismatch'
  printf 'self_check=passed; physical_execution=not_started\n'
  exit 0
fi

[[ $# == 1 && $1 =~ ^[0-9a-f]{40}$ ]] || die 'provide the exact 40-character source commit'
EXPECTED_COMMIT=$1
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die 'requires Linux x86_64'
[[ $(id -u) != 0 ]] || die 'must run as an unprivileged user'
for tool in curl sha256sum python3 git mktemp tar realpath; do
  command -v "$tool" >/dev/null || die "missing required tool: $tool"
done
[[ $PWD == /mnt/c/Users/g/.codex/worktrees/data-pack-commerce/proxy-gateway-minimal ]] \
  || die 'run from the dedicated #753 checkout root'
[[ -d $GIT_DIR ]] || die 'dedicated Git worktree metadata not found'
[[ $(git --git-dir="$GIT_DIR" symbolic-ref --short HEAD) == codex/data-pack-commerce ]] \
  || die 'unexpected source branch'
[[ $(git --git-dir="$GIT_DIR" rev-parse HEAD) == "$EXPECTED_COMMIT" ]] \
  || die 'source commit changed'
[[ -f scripts/data-pack-wsl-artifact-prep.sh ]] || die 'preparation script not found in source root'
SCRIPT_SHA256=$(sha256sum scripts/data-pack-wsl-artifact-prep.sh | cut -d ' ' -f 1)
COMMITTED_SCRIPT_SHA256=$(git --git-dir="$GIT_DIR" show \
  "$EXPECTED_COMMIT:scripts/data-pack-wsl-artifact-prep.sh" | sha256sum | cut -d ' ' -f 1)
[[ $SCRIPT_SHA256 == "$COMMITTED_SCRIPT_SHA256" ]] || die 'script does not match pinned commit'

RUN_DIR=$(mktemp -d /tmp/gccgw-data-pack-wsl.XXXXXXXX) || die 'could not create private run directory'
[[ $RUN_DIR =~ ^/tmp/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$ ]] || die 'unsafe run directory'
[[ ! -L $RUN_DIR && $(realpath -e -- "$RUN_DIR") == "$RUN_DIR" ]] \
  || die 'run directory is not a direct private /tmp directory'
success=0
cleanup_on_failure() {
  if [[ $success == 0 && -d $RUN_DIR && ! -L $RUN_DIR
    && $RUN_DIR =~ ^/tmp/gccgw-data-pack-wsl\.[A-Za-z0-9]{8}$ ]]; then
    local resolved
    resolved=$(realpath -e -- "$RUN_DIR") || return
    [[ $resolved == "$RUN_DIR" ]] || return
    rm -rf -- "$resolved"
  fi
}
trap cleanup_on_failure EXIT
mkdir "$RUN_DIR/source"
git --git-dir="$GIT_DIR" archive --format=tar "$EXPECTED_COMMIT" \
  | tar -xf - -C "$RUN_DIR/source" || die 'source export failed'
[[ $(sha256sum "$RUN_DIR/source/scripts/data-pack-wsl-artifact-prep.sh" | cut -d ' ' -f 1) \
  == "$SCRIPT_SHA256" ]] || die 'exported source differs from pinned script'

curl -fLSs --retry 0 --connect-timeout 10 --max-time 90 \
  "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$RUN_DIR/node-shasums.txt" \
  || die 'Node manifest download failed'
python3 - "$RUN_DIR/node-shasums.txt" "$NODE_ARCHIVE" "$NODE_SHA256" <<'PY' \
  || die 'Node vendor manifest digest mismatch'
import sys
manifest, name, expected = sys.argv[1:]
matches = [line.split() for line in open(manifest, encoding='utf-8')
           if line.strip() and line.split()[-1] == name]
if len(matches) != 1 or matches[0][0] != expected:
    raise SystemExit(1)
PY

curl -fLSs --retry 0 --connect-timeout 10 --max-time 90 \
  'https://api.github.com/repos/HyNetworks/hysteria/releases/tags/app%2Fv2.9.3' \
  -o "$RUN_DIR/hysteria-release.json" || die 'Hysteria release metadata download failed'
python3 - "$RUN_DIR/hysteria-release.json" "$HY_ASSET" "$HY_SHA256" <<'PY' \
  || die 'Hysteria vendor release digest mismatch'
import json, sys
metadata, name, expected = sys.argv[1:]
with open(metadata, encoding='utf-8') as source:
    release = json.load(source)
matches = [asset for asset in release.get('assets', []) if asset.get('name') == name]
if len(matches) != 1 or matches[0].get('digest') != f'sha256:{expected}':
    raise SystemExit(1)
PY

curl -fLSs --retry 0 --connect-timeout 10 --max-time 180 \
  "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}" -o "$RUN_DIR/$NODE_ARCHIVE" \
  || die 'Node artifact download failed'
curl -fLSs --retry 0 --connect-timeout 10 --max-time 180 \
  "https://github.com/HyNetworks/hysteria/releases/download/app/v${HY_VERSION}/${HY_ASSET}" \
  -o "$RUN_DIR/$HY_ASSET" || die 'Hysteria artifact download failed'
printf '%s  %s\n' "$NODE_SHA256" "$RUN_DIR/$NODE_ARCHIVE" | sha256sum --check --status \
  || die 'Node artifact digest mismatch'
printf '%s  %s\n' "$HY_SHA256" "$RUN_DIR/$HY_ASSET" | sha256sum --check --status \
  || die 'Hysteria artifact digest mismatch'
[[ $(git --git-dir="$GIT_DIR" rev-parse HEAD) == "$EXPECTED_COMMIT" ]] \
  || die 'source commit changed during preparation'
python3 - "$RUN_DIR" "$EXPECTED_COMMIT" "$SCRIPT_SHA256" "$NODE_SHA256" "$HY_SHA256" <<'PY'
import json, os, sys
from datetime import datetime, timezone
directory, commit, script, node, hysteria = sys.argv[1:]
record = {
    'state': 'prepared_not_executed',
    'prepared_at': datetime.now(timezone.utc).isoformat(),
    'source_commit': commit,
    'prep_script_sha256': script,
    'node_artifact_sha256': node,
    'hysteria_artifact_sha256': hysteria,
    'physical_processes_started': 0,
}
with open(os.path.join(directory, 'receipt.json'), 'x', encoding='utf-8') as output:
    json.dump(record, output, sort_keys=True, indent=2)
    output.write('\n')
PY
success=1
printf 'state=prepared_not_executed\nrun_dir=%s\nsource_commit=%s\nprep_script_sha256=%s\n' \
  "$RUN_DIR" "$EXPECTED_COMMIT" "$SCRIPT_SHA256"
