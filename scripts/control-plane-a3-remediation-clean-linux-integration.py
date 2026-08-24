#!/usr/bin/env python3
"""Clean-Linux integration checks for the frozen A3 read-only collector.

This harness operates only inside a caller-created root-owned /var/tmp run
directory.  It imports the collector directly, exercises real Linux/kernel and
Debian tooling against disposable fixtures, and emits aggregate JSON only.
It is validation evidence, not an approval, transport, deployment, or Gate.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from types import ModuleType
from typing import Any


SCHEMA_VERSION = "1"
REPORT_TYPE = "a3_remediation_clean_linux_integration"
COLLECTOR_SHA256 = "0e7edee8a3871177bab379b2958d4f02852e4469580e498ae022c23c618a685b"
RUN_ROOT = re.compile(r"^/var/tmp/a3-remediation-aliyun-physical-v1-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SAFE_ENV = {
    "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG": "C",
    "LC_ALL": "C",
    "SYSTEMD_COLORS": "0",
    "SYSTEMD_PAGER": "",
}
SYSTEMD_UNIT = "systemd-journald.service"
FORBIDDEN_OUTPUT_KEYS = {"host", "hostname", "ip", "path", "pid", "processid", "secret", "token", "url", "uri"}


class IntegrationBlocked(Exception):
    """Aggregate-safe integration terminal condition."""


def blocked(condition: str) -> None:
    raise IntegrationBlocked(condition)


def sha256_file(value: Path) -> str:
    digest = hashlib.sha256()
    with value.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_collector(value: Path) -> ModuleType:
    if not value.is_file() or value.is_symlink() or sha256_file(value) != COLLECTOR_SHA256:
        blocked("collector_identity_invalid")
    spec = importlib.util.spec_from_file_location("a3_remediation_readonly_collector", value)
    if spec is None or spec.loader is None:
        blocked("collector_import_failed")
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
    except Exception:
        blocked("collector_import_failed")
    return module


def command(
    command: list[str],
    *,
    maximum: int = 1024 * 1024,
    condition: str = "integration_command_failed",
) -> bytes:
    try:
        completed = subprocess.run(
            command,
            cwd="/",
            env=SAFE_ENV,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        blocked(condition)
    if completed.returncode != 0 or len(completed.stdout) > maximum or len(completed.stderr) > 65536:
        blocked(condition)
    return completed.stdout


def require_root_owned_directory(value: Path) -> None:
    try:
        lexical = value.lstat()
        physical = value.resolve(strict=True)
    except OSError:
        blocked("fixture_custody_invalid")
    if (
        value != physical
        or not stat.S_ISDIR(lexical.st_mode)
        or lexical.st_uid != 0
        or lexical.st_gid != 0
        or stat.S_IMODE(lexical.st_mode) != 0o700
    ):
        blocked("fixture_custody_invalid")


def write_exclusive(value: Path, content: bytes, mode: int) -> None:
    descriptor = os.open(value, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), mode)
    try:
        offset = 0
        while offset < len(content):
            offset += os.write(descriptor, content[offset:])
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chown(value, 0, 0, follow_symlinks=False)
    os.chmod(value, mode, follow_symlinks=False)


def check_scandir(module: ModuleType, fixture: Path) -> dict[str, Any]:
    directory = fixture / "scandir"
    directory.mkdir(mode=0o700)
    for name in ("alpha", "beta", "gamma"):
        write_exclusive(directory / name, b"fixture\n", 0o600)

    module._SCAN_BUDGET = module.ScanBudget(deadline_seconds=30, maximum_entries=3, maximum_bytes=1024)
    observed = list(module.iter_directory_names(str(directory)))
    if sorted(observed) != ["alpha", "beta", "gamma"]:
        blocked("scandir_entries_invalid")

    module._SCAN_BUDGET = module.ScanBudget(deadline_seconds=30, maximum_entries=1, maximum_bytes=1024)
    cap_rejected = False
    try:
        list(module.iter_directory_names(str(directory)))
    except module.Stop as error:
        cap_rejected = str(error) == "scan_entry_limit_exceeded"
    if not cap_rejected:
        blocked("scandir_cap_not_enforced")

    module._SCAN_BUDGET = module.ScanBudget(deadline_seconds=0, maximum_entries=10, maximum_bytes=1024)
    deadline_rejected = False
    try:
        list(module.iter_directory_names(str(directory)))
    except module.Stop as error:
        deadline_rejected = str(error) == "scan_deadline_exceeded"
    if not deadline_rejected:
        blocked("scandir_deadline_not_enforced")

    byte_fixture = fixture / "byte-budget"
    write_exclusive(byte_fixture, b"x" * 4097, 0o600)
    module._SCAN_BUDGET = module.ScanBudget(deadline_seconds=30, maximum_entries=2, maximum_bytes=4096)
    byte_cap_rejected = False
    try:
        module.read_bounded(str(byte_fixture), maximum=8192)
    except module.Stop as error:
        byte_cap_rejected = str(error) == "scan_byte_limit_exceeded"
    if not byte_cap_rejected:
        blocked("scan_byte_cap_not_enforced")
    return {
        "observedEntryCount": len(observed),
        "entryCapRejected": True,
        "byteCapRejected": True,
        "deadlineRejected": True,
    }


def check_proc_consumers(module: ModuleType) -> dict[str, Any]:
    module.reset_scan_budget()
    try:
        executable = os.stat(sys.executable)
        result = module.node_consumers(executable, os.getpid())
        result_after = module.node_consumers(executable, os.getpid())
    except (OSError, module.Stop):
        blocked("proc_consumer_integration_failed")
    if (
        result != result_after
        or result.get("serviceProcessIncluded") is not True
        or result.get("runningProcessCount", 0) < 1
    ):
        blocked("proc_consumer_integration_failed")
    return result


def check_package_manager(module: ModuleType) -> tuple[dict[str, Any], str]:
    module.reset_scan_budget()
    try:
        state = module.package_manager_state()
        state_after = module.package_manager_state()
        policy = module.apt_policy("nodejs")
        record = module.dpkg_record("nodejs")
    except module.Stop:
        blocked("package_manager_integration_failed")
    if state != state_after:
        blocked("package_manager_integration_unstable")
    os_id = state.get("os", {}).get("id")
    architecture = state.get("nativeArchitecture")
    if os_id not in {"ubuntu", "debian"} or not isinstance(architecture, str) or not architecture:
        blocked("package_manager_integration_failed")
    state_digest = hashlib.sha256(json.dumps(state, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    policy_digest = hashlib.sha256(json.dumps(policy, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return (
        {
            "ubuntuCompatible": True,
            "nativeArchitectureObserved": True,
            "aptSourceFileCount": state["aptSources"]["fileCount"],
            "aptListFileCount": state["aptLists"]["fileCount"],
            "dpkgAuditLineCount": state["dpkgAuditLineCount"],
            "stateSha256": state_digest,
            "aptPolicyObserved": True,
            "aptPolicySha256": policy_digest,
            "dpkgRecordPresent": record is not None,
            "dpkgRecordInstalled": bool(record and record.get("installed") is True),
            "doubleScanStable": True,
            "observedEntriesWithinGlobalBudget": module._SCAN_BUDGET.entries <= module.MAX_SCAN_ENTRIES,
            "observedBytesWithinGlobalBudget": module._SCAN_BUDGET.bytes <= module.MAX_TOTAL_SCAN_BYTES,
        },
        architecture,
    )


def build_minimal_deb(package_root: Path, destination: Path, architecture: str) -> None:
    control = package_root / "DEBIAN"
    control.mkdir(parents=True, mode=0o755)
    os.chmod(control, 0o755, follow_symlinks=False)
    payload = package_root / "usr" / "share" / "a3-remediation-fixture"
    payload.mkdir(parents=True, mode=0o755)
    write_exclusive(
        control / "control",
        (
            "Package: nodejs\n"
            "Version: 99.0.0-a3fixture1\n"
            f"Architecture: {architecture}\n"
            "Maintainer: A3 fixture\n"
            "Description: disposable A3 collector integration fixture\n"
        ).encode("ascii"),
        0o600,
    )
    write_exclusive(payload / "marker", b"a3 fixture\n", 0o644)
    command(
        ["/usr/bin/dpkg-deb", "--build", str(package_root), str(destination)],
        condition="deb_custody_integration_failed",
    )
    os.chown(destination, 0, 0, follow_symlinks=False)
    os.chmod(destination, 0o644, follow_symlinks=False)


def check_deb_custody(module: ModuleType, fixture: Path, architecture: str) -> dict[str, Any]:
    archive = fixture / "apt-archives"
    archive.mkdir(mode=0o755)
    os.chown(archive, 0, 0)
    package_root = fixture / "deb-root"
    destination = archive / f"nodejs_99.0.0-a3fixture1_{architecture}.deb"
    build_minimal_deb(package_root, destination, architecture)
    expected_digest = sha256_file(destination)

    held = destination.with_name(destination.name + ".held")
    descriptor = os.open(destination, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.rename(destination, held)
        fields = {
            name: module.read_deb_field(descriptor, name)
            for name in ("Package", "Version", "Architecture")
        }
        os.rename(held, destination)
    finally:
        os.close(descriptor)
        if held.exists() and not destination.exists():
            os.rename(held, destination)
    if fields != {"Package": "nodejs", "Version": "99.0.0-a3fixture1", "Architecture": architecture}:
        blocked("deb_descriptor_inheritance_failed")

    module.APT_ARCHIVE_DIRECTORY = str(archive)
    module.reset_scan_budget()
    try:
        direct = module.inspect_cached_deb(str(destination), "nodejs")
        snapshots = [module.cached_debs("nodejs") for _ in range(4)]
    except module.Stop:
        blocked("deb_custody_integration_failed")
    cached = snapshots[0]
    if (
        any(snapshot != cached for snapshot in snapshots[1:])
        or direct.get("sha256") != expected_digest
        or direct.get("packageMetadataBound") is not True
        or direct.get("metadataStable") is not True
        or direct.get("custodyControlled") is not True
        or len(cached.get("records", [])) != 1
        or cached["records"][0].get("sha256") != expected_digest
        or cached.get("archiveDirectory", {}).get("custodyControlled") is not True
    ):
        blocked("deb_custody_integration_failed")
    return {
        "recordCount": 1,
        "digestStable": True,
        "descriptorMetadataBound": True,
        "descriptorSurvivedPathRename": True,
        "custodyControlled": True,
        "fourScanStable": True,
        "aggregateSha256": expected_digest,
    }


def check_systemd_show(module: ModuleType) -> dict[str, Any]:
    properties = set(module.SERVICE_PROPERTIES)
    invocation = ["/usr/bin/systemctl", "show", SYSTEMD_UNIT, "--no-pager"] + [
        "--property=" + item for item in sorted(properties)
    ]
    output = command(invocation, condition="systemd_show_integration_failed")
    try:
        text = output.decode("utf-8", errors="strict")
        parsed = module.parse_systemd_show(text, properties)
    except (UnicodeError, module.Stop):
        blocked("systemd_show_integration_failed")
    if set(parsed) != properties:
        blocked("systemd_show_integration_failed")
    return {
        "exactPropertySet": True,
        "propertyCount": len(parsed),
        "aggregateSha256": hashlib.sha256(output).hexdigest(),
    }


def check_proxy_metadata(module: ModuleType, fixture: Path) -> dict[str, Any]:
    proxy = fixture / "proxy-servers.json"
    write_exclusive(proxy, b"{}\n", 0o640)
    module.PROXY_PATH = str(proxy)
    module.reset_scan_budget()
    try:
        acl = module.canonical_acl(str(proxy))
        capability = module.capability_state(str(proxy))
    except module.Stop:
        blocked("proxy_metadata_integration_failed")
    access_absent = acl.get("rawAccess", {}).get("present") is False
    default_absent = acl.get("rawDefault", {}).get("present") is False
    capability_absent = capability.get("raw", {}).get("present") is False
    if not access_absent or not default_absent or not capability_absent:
        blocked("proxy_xattr_fixture_invalid")
    acl_canonical = None
    if acl.get("toolAvailable") is True:
        acl_canonical = acl.get("entries") == ["group::r--", "other::---", "user::rw-"]
        if not acl_canonical:
            blocked("proxy_acl_integration_failed")
    capability_empty = None
    if capability.get("toolAvailable") is True:
        capability_empty = capability.get("canonical") == ""
        if not capability_empty:
            blocked("proxy_capability_integration_failed")
    return {
        "aclToolAvailable": acl.get("toolAvailable") is True,
        "aclCanonical": acl_canonical,
        "accessXattrAbsent": True,
        "defaultXattrAbsent": True,
        "capabilityToolAvailable": capability.get("toolAvailable") is True,
        "capabilityCanonicalEmpty": capability_empty,
        "capabilityXattrAbsent": True,
    }


def validate_aggregate_output(value: Any) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if normalized in FORBIDDEN_OUTPUT_KEYS:
                blocked("unsafe_integration_output")
            validate_aggregate_output(item)
    elif isinstance(value, list):
        for item in value:
            validate_aggregate_output(item)
    elif isinstance(value, str):
        if (
            "\x00" in value
            or value.startswith("/")
            or re.search(r"(?:https?|ftp)://", value, re.IGNORECASE)
            or re.fullmatch(r"(?:[0-9]{1,3}\.){3}[0-9]{1,3}", value)
        ):
            blocked("unsafe_integration_output")


def collect(collector: Path, run_root: Path) -> str:
    if os.name != "posix" or sys.platform != "linux" or os.geteuid() != 0:
        blocked("clean_linux_root_required")
    if not RUN_ROOT.fullmatch(str(run_root)):
        blocked("run_scope_invalid")
    require_root_owned_directory(run_root)
    module = load_collector(collector)

    fixture = Path(tempfile.mkdtemp(prefix="fixture-", dir=run_root))
    os.chown(fixture, 0, 0)
    os.chmod(fixture, 0o700)
    require_root_owned_directory(fixture)
    try:
        scandir_result = check_scandir(module, fixture)
        consumers_result = check_proc_consumers(module)
        package_result, architecture = check_package_manager(module)
        deb_result = check_deb_custody(module, fixture, architecture)
        systemd_result = check_systemd_show(module)
        proxy_result = check_proxy_metadata(module, fixture)
        report = {
            "schemaVersion": SCHEMA_VERSION,
            "type": REPORT_TYPE,
            "state": "verified",
            "checks": {
                "scandir": scandir_result,
                "procConsumers": consumers_result,
                "debCustody": deb_result,
                "packageManager": package_result,
                "systemdShow": systemd_result,
                "proxyMetadata": proxy_result,
            },
            "outputPolicy": {
                "hostEmitted": False,
                "networkAddressEmitted": False,
                "processIdentifierEmitted": False,
                "filesystemLocationEmitted": False,
                "secretEmitted": False,
            },
        }
        validate_aggregate_output(report)
        encoded = module.serialize_report(report)
        if len(encoded.encode("utf-8")) >= 1024 * 1024:
            blocked("integration_report_too_large")
        return encoded
    finally:
        shutil.rmtree(fixture, ignore_errors=False)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False, exit_on_error=False)
    parser.add_argument("--collector", required=True)
    parser.add_argument("--run-root", required=True)
    try:
        value = parser.parse_args(argv)
    except (argparse.ArgumentError, SystemExit):
        blocked("invalid_input")
    return value


def safe_error(condition: str) -> str:
    accepted = re.fullmatch(r"[a-z][a-z0-9_]{0,95}", condition)
    value = condition if accepted else "integration_failed"
    return json.dumps(
        {"schemaVersion": SCHEMA_VERSION, "type": REPORT_TYPE, "state": "blocked", "condition": value},
        sort_keys=True,
        separators=(",", ":"),
    ) + "\n"


def main(argv: list[str] | None = None) -> int:
    try:
        args = parse_args(sys.argv[1:] if argv is None else argv)
        sys.stdout.write(collect(Path(args.collector), Path(args.run_root)))
        return 0
    except IntegrationBlocked as error:
        sys.stdout.write(safe_error(str(error)))
        return 1
    except Exception:
        sys.stdout.write(safe_error("integration_failed"))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
