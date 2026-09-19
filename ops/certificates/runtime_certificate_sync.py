#!/usr/bin/python3
"""Bounded Certbot deploy hook. Only the two named QUIC consumers may restart."""
import argparse
from contextlib import ExitStack
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time

DOMAINS = ("jp.gccwebos.com", "sgp.gccwebos.com")
SERVICES = ("mihomo-tuic.service", "hysteria2.service")
CONFIGS = ("/etc/mihomo/config.yaml", "/etc/hysteria/config.yaml")
OPENSSL, SYSTEMCTL = "/usr/bin/openssl", "/usr/bin/systemctl"
PAIR = ("fullchain.pem", "privkey.pem")


class SyncError(Exception):
    """Only constant, non-sensitive error codes may cross the CLI boundary."""


@dataclass(frozen=True)
class Config:
    # Injectable only through Python for isolated tests, never through the CLI.
    root: Path = Path("/")
    uid: int = 0
    runtime_uid: int = None
    stability_seconds: float = 2

    def path(self, absolute):
        return self.root / absolute.lstrip("/")


class Runner:
    def __call__(self, args, data=None, files=None):
        if not args or args[0] not in (OPENSSL, SYSTEMCTL):
            raise SyncError("command_not_allowed")
        try:
            with ExitStack() as stack:
                descriptors = []
                for label, content in (files or {}).items():
                    descriptor = os.memfd_create("certificate-sync", os.MFD_CLOEXEC)
                    stack.callback(os.close, descriptor)
                    with os.fdopen(os.dup(descriptor), "wb") as snapshot:
                        snapshot.write(content)
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    descriptors.append(descriptor)
                    args = [f"/proc/self/fd/{descriptor}" if arg == label else arg for arg in args]
                result = subprocess.run(args, input=data, capture_output=True, timeout=25,
                                        check=False, pass_fds=tuple(descriptors),
                                        env={"PATH": "/usr/sbin:/usr/bin", "LANG": "C", "LC_ALL": "C"})
        except subprocess.TimeoutExpired:
            raise SyncError("command_timeout") from None
        except OSError:
            raise SyncError("command_unavailable") from None
        if result.returncode:
            raise SyncError("command_failed")
        return result.stdout


def posix_metadata_ok(info, owners):
    return info.st_uid in owners and not info.st_mode & 0o022


@dataclass(frozen=True)
class Metadata:
    uid: int
    gid: int
    mode: int
    parent: int


class Tree:
    """Keep directory descriptors anchored; never follow user-controlled symlinks."""
    def __init__(self, config):
        self.config = config
        self.directories = {}

    def close(self):
        for descriptor in self.directories.values():
            os.close(descriptor)

    def directory(self, path, owners, create=False):
        path = Path(path)
        if path == self.config.root:
            if path not in self.directories:
                self.directories[path] = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        else:
            try:
                path.relative_to(self.config.root)
            except ValueError:
                raise SyncError("unsafe_path") from None
            parent = self.directory(path.parent, owners, create)
            if create:
                try:
                    os.mkdir(path.name, 0o700, dir_fd=parent)
                    os.fsync(parent)
                except FileExistsError:
                    pass
            try:
                info = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
                if path not in self.directories:
                    self.directories[path] = os.open(path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
                fixed = os.fstat(self.directories[path])
                if (info.st_dev, info.st_ino) != (fixed.st_dev, fixed.st_ino):
                    raise SyncError("path_identity_changed")
            except OSError:
                raise SyncError("unsafe_path") from None
        descriptor = self.directories[path]
        if not posix_metadata_ok(os.fstat(descriptor), owners):
            raise SyncError("unsafe_path")
        return descriptor

    def read(self, path, owners):
        parent = self.directory(path.parent, owners)
        try:
            descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
            with os.fdopen(descriptor, "rb") as stream:
                info = os.fstat(stream.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not posix_metadata_ok(info, owners):
                    raise SyncError("unsafe_path")
                content = stream.read(4 * 1024 * 1024 + 1)
                if len(content) > 4 * 1024 * 1024:
                    raise SyncError("file_too_large")
                return content, Metadata(info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode), parent)
        except OSError:
            raise SyncError("unsafe_path") from None


def atomic_write(path, data, metadata):
    """A root-only child protects staging entries inside service-owned directories."""
    name = ".certificate-sync-" + secrets.token_hex(12)
    os.mkdir(name, 0o700, dir_fd=metadata.parent)
    stage = None
    try:
        stage = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=metadata.parent)
        info = os.fstat(stage)
        if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise SyncError("unsafe_staging")
        descriptor = os.open("payload", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=stage)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fchown(stream.fileno(), metadata.uid, metadata.gid)
            os.fchmod(stream.fileno(), metadata.mode)
            os.fsync(stream.fileno())
        os.replace("payload", path.name, src_dir_fd=stage, dst_dir_fd=metadata.parent)
        os.fsync(metadata.parent)
    finally:
        if stage is not None:
            try:
                os.unlink("payload", dir_fd=stage)
            except FileNotFoundError:
                pass
            os.close(stage)
        # Non-recursive cleanup only: a concurrent rename cannot redirect writes.
        try:
            os.rmdir(name, dir_fd=metadata.parent)
        except FileNotFoundError:
            pass


def blocks(content):
    matches = re.findall(rb"-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----", content)
    if not matches or re.sub(rb"-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----", b"", content).strip():
        raise SyncError("invalid_certificate_pem")
    return [re.sub(rb"\s", b"", item) for item in matches]


def validate_pair(runner, domain, fullchain, key, source=None, ca=None):
    blocks(fullchain)
    runner([OPENSSL, "x509", "-noout", "-checkhost", domain], fullchain)
    public = runner([OPENSSL, "x509", "-pubkey", "-noout"], fullchain)
    if public != runner([OPENSSL, "pkey", "-pubout"], key):
        raise SyncError("key_mismatch")
    if source is not None:
        if len(blocks(source["cert.pem"])) != 1 or blocks(fullchain) != blocks(source["cert.pem"]) + blocks(source["chain.pem"]):
            raise SyncError("chain_mismatch")
        runner([OPENSSL, "x509", "-noout", "-checkend", "604800"], fullchain)
        runner([OPENSSL, "verify", "-purpose", "sslserver", "-verify_hostname", domain,
                "-CAfile", "@ca", "-no-CApath", "-no-CAstore", "-untrusted", "@chain"], source["cert.pem"],
               files={"@chain": source["chain.pem"], "@ca": ca})


def config_binding(content, domain, mihomo):
    """Accept only explicit block-YAML keys; ambiguity and YAML aliases fail closed."""
    text = content.decode("utf-8")
    expected = f"/etc/mihomo/tls/{domain}/"
    keys = ("certificate", "private-key") if mihomo else ("cert", "key")
    sections, listeners = 0, []
    values = {}
    in_section = False
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if "\t" in line or re.search(r"(?:^|\s)[&*!]|<<\s*:", line):
            raise SyncError("config_binding")
        if not line.startswith(" "):
            in_section = line.rstrip() == ("listeners:" if mihomo else "tls:")
            sections += int(in_section)
        if not in_section:
            continue
        if mihomo and line.startswith("  - "):
            values = {}
            listeners.append(values)
            line = "    " + line[4:]
        match = re.fullmatch(r"( +)(certificate|private-key|cert|key|type):\s*([^#]+?)\s*(?:#.*)?", line)
        if match and match[2] in (*keys, "type"):
            if len(match[1]) != (4 if mihomo else 2) or (mihomo and not listeners):
                raise SyncError("config_binding")
            value = match[3].strip()
            if value.startswith(('"', "'")) and value[-1:] == value[:1]:
                value = value[1:-1]
            if match[2] in values:
                raise SyncError("config_binding")
            values[match[2]] = value
    if mihomo:
        consumers = [listener for listener in listeners if listener.get("type") == "tuic"]
        if len(consumers) != 1:
            raise SyncError("config_binding")
        values = consumers[0]
    if sections != 1 or any(values.get(key) != expected + name for key, name in zip(keys, PAIR)):
        raise SyncError("config_binding")


def service_state(runner, service):
    output = runner([SYSTEMCTL, "show", "--property=ActiveState,SubState,MainPID,NRestarts,Result,ExecStart", service])
    properties = dict(line.split("=", 1) for line in output.decode().splitlines() if "=" in line)
    if (properties.get("ActiveState"), properties.get("SubState"), properties.get("Result")) != ("active", "running", "success"):
        raise SyncError("service_unhealthy")
    try:
        pid, restarts = int(properties["MainPID"]), int(properties["NRestarts"])
        if pid <= 0 or restarts < 0:
            raise ValueError()
    except (KeyError, ValueError):
        raise SyncError("service_unhealthy") from None
    config = CONFIGS[SERVICES.index(service)]
    if not re.search(r"(?:^|\s)" + re.escape(config) + r"(?:\s|;|$)", properties.get("ExecStart", "")):
        raise SyncError("service_config_binding")
    return pid, restarts


def synchronize(config, runner, domain, lineage, apply=False, sleep=time.sleep):
    if domain not in DOMAINS:
        raise SyncError("unsupported_domain")
    if lineage != f"/etc/letsencrypt/live/{domain}":
        return {"status": "ignored", "domain": domain}
    runtime_uid = config.runtime_uid if config.runtime_uid is not None else config.uid
    owners, root_owner = {config.uid, runtime_uid}, {config.uid}
    source = config.path(f"/etc/letsencrypt/live/{domain}")
    archive = config.path(f"/etc/letsencrypt/archive/{domain}")
    target = config.path(f"/etc/mihomo/tls/{domain}")
    state = config.path(f"/var/lib/gccgw-certificate-sync/{domain}")
    with ExitStack() as stack:
        tree = Tree(config)
        stack.callback(tree.close)
        state_fd = None
        if apply or state.exists() or state.is_symlink():
            state_fd = tree.directory(state, root_owner, create=apply)
            if stat.S_IMODE(os.fstat(state_fd).st_mode) != 0o700:
                raise SyncError("unsafe_state_permissions")
            import fcntl
            flags = os.O_RDONLY | os.O_NOFOLLOW | (os.O_CREAT if apply else 0)
            try:
                lock = os.open("lock", flags, 0o600, dir_fd=state_fd)
                stack.callback(os.close, lock)
                info = os.fstat(lock)
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not posix_metadata_ok(info, root_owner) or stat.S_IMODE(info.st_mode) != 0o600:
                    raise SyncError("unsafe_path")
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise SyncError("already_running") from None
            except FileNotFoundError:
                if apply:
                    raise
            try:
                os.stat("pending.json", dir_fd=state_fd, follow_symlinks=False)
            except FileNotFoundError:
                pass
            else:
                raise SyncError("pending_manual_recovery")
        source_fd = tree.directory(source, root_owner)
        tree.directory(archive, root_owner)
        new = {}
        for name in (*PAIR, "cert.pem", "chain.pem"):
            link = os.stat(name, dir_fd=source_fd, follow_symlinks=False)
            if not stat.S_ISLNK(link.st_mode) or link.st_uid != config.uid:
                raise SyncError("unsafe_source_link")
            resolved = (source / name).resolve(strict=True)
            if resolved.parent != archive:
                raise SyncError("source_outside_archive")
            new[name], source_metadata = tree.read(resolved, root_owner)
            if name == "privkey.pem" and source_metadata.mode & 0o007:
                raise SyncError("unsafe_key_permissions")
        ca, _ = tree.read(config.path("/etc/ssl/certs/ca-certificates.crt"), root_owner)
        validate_pair(runner, domain, new[PAIR[0]], new[PAIR[1]], source=new, ca=ca)
        old, metadata = {}, {}
        for name in PAIR:
            old[name], metadata[name] = tree.read(target / name, owners)
            if name == "privkey.pem" and metadata[name].mode & 0o007:
                raise SyncError("unsafe_key_permissions")
        validate_pair(runner, domain, old[PAIR[0]], old[PAIR[1]])
        configurations = {}
        for index, name in enumerate(CONFIGS):
            path = config.path(name)
            content, _ = tree.read(path, owners)
            config_binding(content, domain, index == 0)
            configurations[path] = hashlib.sha256(content).digest()
        before = {service: service_state(runner, service) for service in SERVICES}
        if not apply:
            return {"status": "checked", "domain": domain}
        if all(new[name] == old[name] for name in PAIR):
            return {"status": "unchanged", "domain": domain}
        state_metadata = Metadata(config.uid, os.fstat(state_fd).st_gid, 0o600, state_fd)

        def record(name, value):
            atomic_write(state / name, json.dumps(value, sort_keys=True).encode() + b"\n", state_metadata)

        def verify_configuration():
            for path, digest in configurations.items():
                if hashlib.sha256(tree.read(path, owners)[0]).digest() != digest:
                    raise SyncError("config_changed")

        def restart_and_check():
            failed = False
            for service in SERVICES:
                try:
                    runner([SYSTEMCTL, "restart", service])
                except SyncError:
                    failed = True
            if failed:
                raise SyncError("restart_failed")
            observed = {service: service_state(runner, service) for service in SERVICES}
            sleep(config.stability_seconds)
            if observed != {service: service_state(runner, service) for service in SERVICES}:
                raise SyncError("service_unstable")
            if any(observed[service][0] == before[service][0] or observed[service][1] != 0 for service in SERVICES):
                raise SyncError("service_not_restarted")
            verify_configuration()

        for name in PAIR:
            atomic_write(state / ("previous-" + name), old[name], state_metadata)
            if tree.read(state / ("previous-" + name), root_owner)[0] != old[name]:
                raise SyncError("backup_mismatch")
        # A pre-mutation failure must never start a service stopped by another actor.
        verify_configuration()
        if before != {service: service_state(runner, service) for service in SERVICES}:
            raise SyncError("service_changed")
        if any(tree.read(target / name, owners)[0] != old[name] for name in PAIR):
            raise SyncError("target_changed")
        record("pending.json", {"domain": domain, "status": "pending", "old_sha256": {name: hashlib.sha256(old[name]).hexdigest() for name in PAIR}})
        try:
            for name in PAIR:
                atomic_write(target / name, new[name], metadata[name])
            restart_and_check()
            for name in PAIR:
                if tree.read(target / name, owners)[0] != new[name]:
                    raise SyncError("target_changed")
            record("last-result.json", {"domain": domain, "status": "applied", "at": int(time.time())})
        except Exception:
            try:
                for name in PAIR:
                    atomic_write(target / name, old[name], metadata[name])
                for name in PAIR:
                    if tree.read(target / name, owners)[0] != old[name]:
                        raise SyncError("restore_mismatch")
                restart_and_check()
                record("last-result.json", {"domain": domain, "status": "rolled_back", "at": int(time.time())})
                os.unlink("pending.json", dir_fd=state_fd)
                os.fsync(state_fd)
            except Exception:
                raise SyncError("rollback_failed_manual_recovery") from None
            raise SyncError("apply_failed_rolled_back") from None
        os.unlink("pending.json", dir_fd=state_fd)
        os.fsync(state_fd)
        return {"status": "applied", "domain": domain}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--domain", required=True, choices=DOMAINS)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    code = 0
    try:
        if sys.platform != "linux" or os.geteuid() != 0:
            raise SyncError("linux_root_required")
        import pwd
        config = Config(runtime_uid=pwd.getpwnam("proxy-gateway").pw_uid)
        result = synchronize(config, Runner(), args.domain, os.environ.get("RENEWED_LINEAGE", ""), apply=args.apply)
    except SyncError as error:
        result, code = {"status": "failed", "domain": args.domain, "reason": str(error)}, 1
    except Exception:
        result, code = {"status": "failed", "domain": args.domain, "reason": "unexpected_error"}, 1
    output = json.dumps(result, sort_keys=True)
    print(output, flush=True)
    try:
        import syslog
        syslog.openlog("gccgw-certificate-sync")
        syslog.syslog(syslog.LOG_ERR if code else syslog.LOG_INFO, output)
    except (ImportError, OSError):
        pass
    return code


if __name__ == "__main__":
    sys.exit(main())
