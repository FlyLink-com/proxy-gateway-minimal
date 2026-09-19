"""Isolated certificate transaction tests; no production access or real credentials."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

import runtime_certificate_sync as sync


def certificate(label):
    return b"-----BEGIN CERTIFICATE-----\n" + label + b"\n-----END CERTIFICATE-----\n"


class FakeRunner:
    def __init__(self):
        self.commands = []
        self.restarts = []
        self.fail_restarts = set()
        self.inactive = set()
        self.invalid = None
        self.pids = {service: 100 + n for n, service in enumerate(sync.SERVICES)}
        self.on_restart = None

    def __call__(self, args, data=None, files=None):
        self.commands.append(args)
        if args[0] == sync.SYSTEMCTL:
            service = args[-1]
            if args[1] == "restart":
                self.restarts.append(service)
                if len(self.restarts) in self.fail_restarts:
                    raise sync.SyncError("command_failed")
                self.pids[service] += 10
                if self.on_restart:
                    self.on_restart()
                return b""
            active = "inactive" if service in self.inactive else "active"
            sub = "dead" if service in self.inactive else "running"
            config = "/etc/mihomo/config.yaml" if service == sync.SERVICES[0] else "/etc/hysteria/config.yaml"
            return (f"ActiveState={active}\nSubState={sub}\nMainPID={self.pids[service]}\n"
                    f"NRestarts=0\nResult=success\nExecStart={{ argv[]=/usr/local/bin/runtime -c {config} ; }}\n").encode()
        if self.invalid and self.invalid in args:
            raise sync.SyncError("command_failed")
        if args[1] == "pkey":
            return b"PUB:" + (data or b"").replace(b"KEY", b"")
        if "-pubkey" in args:
            return b"PUB:" + (data or b"").splitlines()[1]
        return b"OK"


class Fixture:
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.domain = "jp.gccwebos.com"
        self.config = sync.Config(root=self.root, uid=os.getuid() if hasattr(os, "getuid") else 0,
                                  stability_seconds=0)
        self.source = self.root / "etc/letsencrypt/live" / self.domain
        self.archive = self.root / "etc/letsencrypt/archive" / self.domain
        self.target = self.root / "etc/mihomo/tls" / self.domain
        self.state = self.root / "var/lib/gccgw-certificate-sync" / self.domain
        self.source.mkdir(parents=True)
        self.archive.mkdir(parents=True)
        self.target.mkdir(parents=True)
        self.put_source("cert.pem", certificate(b"NEW"))
        self.put_source("chain.pem", certificate(b"CA"))
        self.put_source("fullchain.pem", certificate(b"NEW") + certificate(b"CA"))
        self.put_source("privkey.pem", b"NEWKEY")
        self.write(self.root / "etc/ssl/certs/ca-certificates.crt", certificate(b"CA"))
        self.old = {"fullchain.pem": certificate(b"OLD") + certificate(b"CA"), "privkey.pem": b"OLDKEY"}
        for name, data in self.old.items():
            self.write(self.target / name, data, 0o640)
        for name, content in (
                ("mihomo", f"listeners:\n  - name: tuic\n    type: tuic\n    certificate: /etc/mihomo/tls/{self.domain}/fullchain.pem\n    private-key: /etc/mihomo/tls/{self.domain}/privkey.pem\n"),
                ("hysteria", f"tls:\n  cert: /etc/mihomo/tls/{self.domain}/fullchain.pem\n  key: /etc/mihomo/tls/{self.domain}/privkey.pem\n")):
            self.write(self.root / f"etc/{name}/config.yaml", content.encode(), 0o600)
        self.runner = FakeRunner()
        # chmod has no POSIX permission representation on Windows. Security
        # policy itself is tested using explicit stat values below on Linux.
        if os.name == "nt":
            self.guard = mock.patch.object(sync, "posix_metadata_ok", return_value=True)
            self.guard.start()
            self.addCleanup(self.guard.stop)

    @staticmethod
    def write(path, data, mode=0o600):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        path.chmod(mode)

    def put_source(self, name, data):
        archive = self.archive / name.replace(".pem", "1.pem")
        self.write(archive, data)
        if not (self.source / name).exists():
            try:
                (self.source / name).symlink_to(archive)
            except OSError:
                self.skipTest("source symlink creation requires Windows Developer Mode")

    def run_sync(self, apply=True, lineage=None):
        return sync.synchronize(self.config, self.runner, self.domain,
                                lineage if lineage is not None else f"/etc/letsencrypt/live/{self.domain}",
                                apply=apply, sleep=lambda seconds: None)

    def assert_old(self):
        for name, data in self.old.items():
            self.assertEqual((self.target / name).read_bytes(), data)


class SyncTests(Fixture, unittest.TestCase):
    def test_check_only_is_read_only(self):
        self.assertEqual(self.run_sync(apply=False)["status"], "checked")
        self.assertFalse(self.state.exists())
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()

    def test_other_lineage_is_ignored_before_any_access(self):
        for lineage in ("/etc/letsencrypt/live/other.example", "", "/etc/letsencrypt/live/jp.gccwebos.com/../jp.gccwebos.com"):
            self.assertEqual(self.run_sync(lineage=lineage)["status"], "ignored")
        self.assertFalse(self.state.exists())
        self.assertEqual(self.runner.commands, [])

    def test_unsupported_domain_rejected(self):
        with self.assertRaises(sync.SyncError):
            sync.synchronize(self.config, self.runner, "../jp.gccwebos.com", "", apply=True)

    def test_unchanged_does_not_restart(self):
        for name in self.old:
            self.write(self.target / name, (self.source / name).read_bytes(), 0o640)
        self.assertEqual(self.run_sync()["status"], "unchanged")
        self.assertEqual(self.runner.restarts, [])

    def test_bad_certificate_hostname_chain_and_expiry_rejected(self):
        for option in ("-checkhost", "verify", "-checkend"):
            with self.subTest(option=option):
                self.runner.invalid = option
                with self.assertRaises(sync.SyncError):
                    self.run_sync()
                self.assertEqual(self.runner.restarts, [])
                self.assert_old()

    def test_wrong_key_rejected(self):
        self.put_source("privkey.pem", b"WRONGKEY")
        with self.assertRaisesRegex(sync.SyncError, "key_mismatch"):
            self.run_sync()
        self.assert_old()
        self.assertEqual(self.runner.restarts, [])

    def test_fullchain_must_match_cert_and_chain(self):
        self.put_source("chain.pem", certificate(b"OTHER"))
        with self.assertRaisesRegex(sync.SyncError, "chain_mismatch"):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])

    def test_inactive_consumer_refuses_without_starting(self):
        self.runner.inactive.add(sync.SERVICES[1])
        with self.assertRaisesRegex(sync.SyncError, "service_unhealthy"):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()

    def test_config_requires_actual_target_references(self):
        self.write(self.root / "etc/hysteria/config.yaml", b"tls:\n  cert: /other/cert\n  key: /other/key\n")
        with self.assertRaisesRegex(sync.SyncError, "config_binding"):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])

    def test_commented_or_other_listener_paths_do_not_bind_tuic(self):
        path = self.root / "etc/mihomo/config.yaml"
        original = path.read_bytes()
        invalid_configs = (
            original.replace(b"    certificate:", b"    # certificate:"),
            original.replace(b"    type: tuic", b"    type: other") + b"  - name: real\n    type: tuic\n    certificate: /wrong\n    private-key: /wrong\n",
            original + b"listeners:\n  - name: duplicate\n    type: tuic\n",
        )
        for content in invalid_configs:
            with self.subTest(content=content[:12]):
                self.write(path, content)
                with self.assertRaisesRegex(sync.SyncError, "config_binding"):
                    self.run_sync()
        self.assertEqual(self.runner.restarts, [])

    def test_service_stopped_during_backup_is_never_restarted(self):
        original = sync.atomic_write

        def write(path, data, metadata):
            original(path, data, metadata)
            if path == self.state / "previous-privkey.pem":
                self.runner.inactive.add(sync.SERVICES[1])

        with mock.patch.object(sync, "atomic_write", side_effect=write):
            with self.assertRaisesRegex(sync.SyncError, "service_unhealthy"):
                self.run_sync()
        self.assert_old()
        self.assertEqual(self.runner.restarts, [])
        self.assertFalse((self.state / "pending.json").exists())

    def test_success_restarts_both_and_preserves_target_mode(self):
        self.assertEqual(self.run_sync()["status"], "applied")
        self.assertEqual(self.runner.restarts, list(sync.SERVICES))
        for name in self.old:
            self.assertEqual((self.target / name).read_bytes(), (self.source / name).read_bytes())
            self.assertEqual((self.state / ("previous-" + name)).read_bytes(), self.old[name])
            if os.name != "nt":
                self.assertEqual((self.target / name).stat().st_mode & 0o777, 0o640)
        self.assertFalse((self.state / "pending.json").exists())
        self.assertTrue((self.state / "last-result.json").exists())

    def test_partial_copy_failure_restores_pair(self):
        original = sync.atomic_write
        failed = False

        def write(path, data, metadata):
            nonlocal failed
            if path == self.target / "privkey.pem" and not failed:
                failed = True
                raise OSError("injected private material must not be printed")
            return original(path, data, metadata)

        with mock.patch.object(sync, "atomic_write", side_effect=write):
            with self.assertRaisesRegex(sync.SyncError, "apply_failed_rolled_back"):
                self.run_sync()
        self.assert_old()
        self.assertEqual(self.runner.restarts, list(sync.SERVICES))
        self.assertFalse((self.state / "pending.json").exists())

    def test_restart_failure_restores_and_restarts_both(self):
        self.runner.fail_restarts = {2}
        with self.assertRaisesRegex(sync.SyncError, "apply_failed_rolled_back"):
            self.run_sync()
        self.assert_old()
        self.assertEqual(self.runner.restarts, list(sync.SERVICES) * 2)
        self.assertFalse((self.state / "pending.json").exists())

    def test_rollback_failure_retains_pending_and_reports_failure(self):
        self.runner.fail_restarts = {2, 3}
        with self.assertRaisesRegex(sync.SyncError, "rollback_failed_manual_recovery"):
            self.run_sync()
        self.assertTrue((self.state / "pending.json").exists())

    def test_pending_transaction_blocks_apply_and_check(self):
        self.state.mkdir(parents=True, mode=0o700)
        self.write(self.state / "pending.json", b"{}")
        for apply in (False, True):
            with self.assertRaisesRegex(sync.SyncError, "pending_manual_recovery"):
                self.run_sync(apply=apply)
        self.assertEqual(self.runner.restarts, [])

    def test_hard_interrupt_leaves_pending_and_original_backup(self):
        self.runner.on_restart = lambda: (_ for _ in ()).throw(KeyboardInterrupt())
        with self.assertRaises(KeyboardInterrupt):
            self.run_sync()
        self.assertTrue((self.state / "pending.json").exists())
        self.assertEqual((self.state / "previous-privkey.pem").read_bytes(), self.old["privkey.pem"])
        with self.assertRaisesRegex(sync.SyncError, "pending_manual_recovery"):
            self.run_sync()

    def test_config_drift_causes_rollback_failure_not_success(self):
        self.runner.on_restart = lambda: self.write(self.root / "etc/hysteria/config.yaml", b"changed")
        with self.assertRaisesRegex(sync.SyncError, "rollback_failed_manual_recovery"):
            self.run_sync()
        self.assert_old()
        self.assertTrue((self.state / "pending.json").exists())

    def test_target_symlink_rejected(self):
        target = self.target / "privkey.pem"
        target.unlink()
        target.symlink_to(self.archive / "privkey1.pem")
        with self.assertRaisesRegex(sync.SyncError, "unsafe_path"):
            self.run_sync()

    def test_target_hardlink_rejected(self):
        os.link(self.target / "privkey.pem", self.target / "extra-key-link")
        with self.assertRaisesRegex(sync.SyncError, "unsafe_path"):
            self.run_sync()

    def test_target_ancestor_symlink_rejected(self):
        renamed = self.target.with_name("held-directory")
        self.target.rename(renamed)
        self.target.symlink_to(renamed, target_is_directory=True)
        with self.assertRaisesRegex(sync.SyncError, "unsafe_path"):
            self.run_sync()

    def test_world_readable_key_rejected(self):
        (self.target / "privkey.pem").chmod(0o644)
        with self.assertRaisesRegex(sync.SyncError, "unsafe_key_permissions"):
            self.run_sync()

    def test_automatic_restart_before_stability_window_is_rejected(self):
        runner = self.runner

        def unstable(args, data=None, files=None):
            output = runner(args, data, files)
            if args[0] == sync.SYSTEMCTL and args[1] == "show" and len(runner.restarts) == 2:
                return output.replace(b"NRestarts=0", b"NRestarts=1")
            return output

        self.runner = unstable
        with self.assertRaisesRegex(sync.SyncError, "apply_failed_rolled_back"):
            self.run_sync()
        self.assert_old()

    def test_source_link_outside_archive_rejected(self):
        source = self.source / "privkey.pem"
        source.unlink()
        source.symlink_to(self.target / "privkey.pem")
        with self.assertRaisesRegex(sync.SyncError, "source_outside_archive"):
            self.run_sync()

    def test_writable_path_and_nonroot_ownership_rejected(self):
        with mock.patch.object(sync, "posix_metadata_ok", return_value=False):
            with self.assertRaisesRegex(sync.SyncError, "unsafe_path"):
                self.run_sync()

    @unittest.skipIf(os.name == "nt", "fcntl lock is Linux-only")
    def test_concurrent_lock_refuses_second_process(self):
        import fcntl
        self.state.mkdir(parents=True, mode=0o700)
        self.write(self.state / "lock", b"")
        with (self.state / "lock").open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(sync.SyncError, "already_running"):
                self.run_sync()
        self.assertEqual(self.runner.restarts, [])

    def test_runner_whitelist_and_timeout_redact_output(self):
        runner = sync.Runner()
        with self.assertRaisesRegex(sync.SyncError, "command_not_allowed"):
            runner(["/bin/sh", "-c", "false"])
        with mock.patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired("opaque", 1, stderr=b"sensitive")):
            with self.assertRaisesRegex(sync.SyncError, "command_timeout") as raised:
                runner([sync.OPENSSL, "version"])
        self.assertNotIn("sensitive", str(raised.exception))


class CryptoRunner(FakeRunner):
    def __call__(self, args, data=None, files=None):
        if args[0] == sync.OPENSSL:
            return sync.Runner()(args, data, files)
        return super().__call__(args, data, files)


@unittest.skipUnless(os.name == "posix" and Path(sync.OPENSSL).is_file(), "requires Linux OpenSSL")
class OpenSSLTests(Fixture, unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.crypto_temp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.crypto_temp.cleanup)
        cls.crypto = Path(cls.crypto_temp.name)

        def openssl(*args):
            result = subprocess.run([sync.OPENSSL, *args], cwd=cls.crypto,
                                    capture_output=True, timeout=20, check=False)
            if result.returncode:
                raise RuntimeError("synthetic_openssl_fixture_failed")

        for ca in ("ca", "untrusted"):
            openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", f"{ca}.key",
                    "-out", f"{ca}.crt", "-days", "365", "-subj", "/CN=isolated-test-CA",
                    "-addext", "basicConstraints=critical,CA:TRUE")
        for csr, domain in (("leaf", "jp.gccwebos.com"), ("wrong", "other.invalid")):
            openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", f"{csr}.key",
                    "-out", f"{csr}.csr", "-subj", f"/CN={domain}", "-addext", f"subjectAltName=DNS:{domain}")
        for label, days, csr, ca in (("new", "30", "leaf", "ca"), ("old", "15", "leaf", "ca"),
                                     ("short", "2", "leaf", "ca"), ("expired", "-1", "leaf", "ca"),
                                     ("wrong", "30", "wrong", "ca"), ("untrusted", "30", "leaf", "untrusted")):
            openssl("x509", "-req", "-in", f"{csr}.csr", "-CA", f"{ca}.crt", "-CAkey", f"{ca}.key",
                    "-set_serial", str(1 + len(label)), "-days", days, "-copy_extensions", "copy", "-out", f"{label}-leaf.crt")

    def setUp(self):
        super().setUp()
        ca = (self.crypto / "ca.crt").read_bytes()
        self.write(self.root / "etc/ssl/certs/ca-certificates.crt", ca)
        self.set_source("new")
        self.old = {"fullchain.pem": (self.crypto / "old-leaf.crt").read_bytes() + ca,
                    "privkey.pem": (self.crypto / "leaf.key").read_bytes()}
        for name, content in self.old.items():
            self.write(self.target / name, content, 0o640)
        self.runner = CryptoRunner()

    def set_source(self, label, ca="ca", key="leaf"):
        leaf = (self.crypto / f"{label}-leaf.crt").read_bytes()
        chain = (self.crypto / f"{ca}.crt").read_bytes()
        for name, content in (("cert.pem", leaf), ("chain.pem", chain), ("fullchain.pem", leaf + chain),
                              ("privkey.pem", (self.crypto / f"{key}.key").read_bytes())):
            self.put_source(name, content)

    def test_valid_real_chain_and_key_apply_then_noop(self):
        self.assertEqual(self.run_sync(apply=False)["status"], "checked")
        self.assertFalse(self.state.exists())
        self.assertEqual(self.run_sync()["status"], "applied")
        self.assertEqual(self.run_sync()["status"], "unchanged")
        self.assertEqual(self.runner.restarts, list(sync.SERVICES))

    def test_actual_wrong_hostname_is_rejected(self):
        self.set_source("wrong", key="wrong")
        with self.assertRaises(sync.SyncError):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()

    def test_actual_wrong_private_key_is_rejected(self):
        self.put_source("privkey.pem", (self.crypto / "wrong.key").read_bytes())
        with self.assertRaisesRegex(sync.SyncError, "key_mismatch"):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()

    def test_actual_expired_and_short_certificates_are_rejected(self):
        for label in ("expired", "short"):
            with self.subTest(label=label):
                self.set_source(label)
                with self.assertRaises(sync.SyncError):
                    self.run_sync()
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()

    def test_actual_untrusted_ca_is_rejected(self):
        self.set_source("untrusted", ca="untrusted")
        with self.assertRaises(sync.SyncError):
            self.run_sync()
        self.assertEqual(self.runner.restarts, [])
        self.assert_old()


if __name__ == "__main__":
    unittest.main()
