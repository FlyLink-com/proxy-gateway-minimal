"""Only disposable synthetic backup trees; no production paths or transports."""
import contextlib
import copy
import datetime as dt
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest.mock

import edge_backup_execute as execute
import edge_backup_manifest as manifest

NOW = dt.datetime(2026, 9, 24, 12, tzinfo=dt.timezone.utc)


class FixtureObserver(execute.ProtectionObserver):
    source_digest = 'a' * 64

    def __init__(self, review):
        self.review = review
        self.calls = 0
        self.on_call = None

    def read_protection(self, scope):
        self.calls += 1
        if self.on_call:
            self.on_call(self.calls)
        return dict(self.review)


class InputTests(unittest.TestCase):
    def test_source_digest_binds_three_modules(self):
        original = execute.source_digest()
        self.assertRegex(original, r'^[a-f0-9]{64}$')
        real_read = Path.read_bytes
        def changed(path):
            return b'changed fixture module' if path.name == 'edge_backup_manifest.py' else real_read(path)
        with unittest.mock.patch.object(Path, 'read_bytes', changed):
            self.assertNotEqual(original, execute.source_digest())

    def test_canonical_digest_matches_manifest_encoder(self):
        value = {'metadata': {'z': 1, 'a': 'non-ascii-\u4e2d'}, 'digest': 'ignored'}
        self.assertEqual(execute.canonical_digest(value), manifest.manifest_digest(value))

    def test_cli_apply_is_not_wired_and_cannot_inject_observer(self):
        output = io.StringIO()
        with unittest.mock.patch.object(execute, 'bounded_json', return_value={}), contextlib.redirect_stdout(output):
            self.assertEqual(execute.main(['--manifest', 'fixture.json', '--apply']), 2)
        self.assertEqual(json.loads(output.getvalue())['state'], 'rejected')

    def test_metadata_bools_not_integers(self):
        info = dict.fromkeys(execute.META_KEYS, 0)
        info['dev'] = True
        with self.assertRaises(execute.ExecuteError):
            execute.validate_metadata(info)


class DirectoryBindingInputTests(unittest.TestCase):
    def setUp(self):
        self.paths = [execute.ROOT, execute.ROOT + '/hysteria2']
        self.document = {'schemaVersion': 1, 'type': 'edge-backup-retention-manifest',
            'complete': True, 'blockers': [], 'policy': dict(execute.POLICY),
            'scope': {'root': execute.ROOT, 'target': 'sgp', 'protocolDirs': ['hysteria2'],
                      'allowedNames': sorted(execute.retention.ALLOWED_NAMES)},
            'observedAt': NOW.isoformat(), 'entries': [],
            'protectionReview': {'complete': True, 'evidenceDigest': 'b' * 64, 'holds': []},
            'directories': []}
        for index, path in enumerate(self.paths):
            info = dict.fromkeys(execute.META_KEYS, 0)
            info.update(dev=10, ino=index + 1, mode=stat.S_IFDIR | 0o700,
                        nlink=2, uid=996, gid=987)
            self.document['directories'].append({'path': path, 'identity': info})
        self.rehash()
        self.bindings = {row['path']: {key: row['identity'][key] for key in execute.IMMUTABLE_DIR_KEYS}
                         for row in self.document['directories']}

    def rehash(self):
        self.document['digest'] = execute.canonical_digest(self.document)

    def test_no_binding_preserves_default_root_owner_rule(self):
        with self.assertRaisesRegex(execute.ExecuteError, 'unsafe_directory_metadata'):
            execute.validate_manifest(self.document)

    def test_exact_service_owned_private_bindings_validate_without_global_uid_allowlist(self):
        result = execute.validate_manifest(self.document, directory_bindings=self.bindings)
        self.assertEqual(set(result['directories']), set(self.paths))
        self.assertEqual(execute.ROOT_UID, 0)

    def test_binding_shape_missing_path_extra_path_and_noninteger_refused(self):
        cases = [[], {}, {self.paths[0]: self.bindings[self.paths[0]]},
                 {**self.bindings, '/etc/synthetic': self.bindings[self.paths[0]]}]
        for key, value in (('uid', True), ('ino', -1), ('mode', '0700')):
            altered = copy.deepcopy(self.bindings)
            altered[self.paths[0]][key] = value
            cases.append(altered)
        extra = copy.deepcopy(self.bindings)
        extra[self.paths[0]]['mtimeNs'] = 0
        cases.append(extra)
        for bindings in cases:
            with self.subTest(bindings=bindings):
                with self.assertRaisesRegex(execute.ExecuteError, 'directory_bindings_invalid'):
                    execute.validate_manifest(self.document, directory_bindings=bindings)

    def test_each_immutable_identity_field_must_match_manifest(self):
        for key in execute.IMMUTABLE_DIR_KEYS:
            with self.subTest(field=key):
                altered = copy.deepcopy(self.bindings)
                altered[self.paths[1]][key] += 1
                with self.assertRaises(execute.ExecuteError):
                    execute.validate_manifest(self.document, directory_bindings=altered)

    def test_service_owned_mode_must_be_private_even_when_exactly_bound(self):
        for mode in (stat.S_IFDIR | 0o750, stat.S_IFDIR | 0o770,
                     stat.S_IFDIR | 0o4700, stat.S_IFREG | 0o700):
            self.document['directories'][1]['identity']['mode'] = mode
            self.bindings[self.paths[1]]['mode'] = mode
            self.rehash()
            with self.subTest(mode=mode):
                with self.assertRaisesRegex(execute.ExecuteError, 'unsafe_directory_metadata'):
                    execute.validate_manifest(self.document, directory_bindings=self.bindings)

    def test_incomplete_manifest_or_multiple_protocols_never_get_exception(self):
        self.document['complete'] = False
        self.rehash()
        with self.assertRaises(execute.ExecuteError):
            execute.validate_manifest(self.document, directory_bindings=self.bindings)
        self.document['complete'] = True
        self.document['scope']['protocolDirs'] = ['hysteria2', 'xray']
        self.rehash()
        with self.assertRaisesRegex(execute.ExecuteError, 'directory_bindings_invalid'):
            execute.validate_manifest(self.document, directory_bindings=self.bindings)

    def test_execute_passes_explicit_bindings_to_validation(self):
        result = execute.execute(self.document, {'directoryBindings': self.bindings})
        self.assertEqual(result['state'], 'dry_run')
        self.assertEqual(result['deletedCount'], 0)

    def test_explicit_null_binding_is_not_missing_approval_field(self):
        for row in self.document['directories']:
            row['identity']['uid'] = 0
        self.rehash()
        with self.assertRaisesRegex(execute.ExecuteError, 'directory_bindings_invalid'):
            execute.execute(self.document, {'directoryBindings': None})

    def test_bindings_do_not_substitute_for_explicit_execution_approval(self):
        with self.assertRaisesRegex(execute.ExecuteError, 'explicit_approval_required'):
            execute.execute(self.document, {'directoryBindings': self.bindings, 'approved': False},
                            apply=True, clock=lambda: NOW, hostname=lambda: execute.HOSTS['sgp'])


@unittest.skipUnless(os.name == 'posix' and hasattr(os, 'O_NOFOLLOW'), 'Linux directory-fd and renameat2 integration')
class ExecutorTests(unittest.TestCase):
    def setUp(self):
        # Bound service-owned integration also checks every ancestor above ROOT;
        # root's private home avoids making /tmp's writable namespace an exception.
        self.temp = tempfile.TemporaryDirectory(dir=Path.home() if os.getuid() == 0 else None)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'edge'
        self.protocol = self.root / 'hysteria2'
        self.protocol.mkdir(parents=True)
        self.quarantine = self.base / 'quarantine'
        self.quarantine.mkdir(mode=0o700)
        self.receipts = self.base / 'receipts'
        self.receipts.mkdir(mode=0o700)
        for module, name, value in ((execute, 'ROOT', str(self.root)), (manifest, 'PRODUCTION_ROOT', str(self.root)),
                                    (execute, 'QUARANTINE_PARENT', str(self.quarantine)),
                                    (execute, 'RECEIPT_PARENT', str(self.receipts)),
                                    (execute, 'ROOT_UID', os.getuid()), (execute, 'ROOT_GID', os.getgid())):
            patch = unittest.mock.patch.object(module, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        for days in range(40, 63):
            moment = NOW - dt.timedelta(days=days)
            path = self.protocol / ('config.yaml.' + moment.strftime('%Y_%m_%dT%H_%M_%S_000Z.bak'))
            path.write_bytes(b'synthetic private backup')
            os.chmod(path, 0o600)
            os.utime(path, ns=(int(moment.timestamp()) * 1000000000,) * 2)
        self.review = {'complete': True, 'evidenceDigest': 'b' * 64, 'holds': []}
        self.observer = FixtureObserver(self.review)
        self.document = manifest.build_manifest(root=str(self.root), protocol_dirs=['hysteria2'],
            allowed_names=['config.json', 'config.yaml', 'config.yml'], target='sgp', observed_at=NOW,
            protection_review=self.review)
        self.assertTrue(self.document['complete'])
        self.candidates = [row['path'] for row in self.document['entries'] if row['disposition'] == 'candidate']
        self.protected = [row['path'] for row in self.document['entries'] if row['disposition'] == 'protected']
        self.assertEqual(len(self.candidates), 3)
        self.approval = {'schemaVersion': 1, 'type': 'edge-backup-retention-approval', 'approved': True,
            'manifestDigest': self.document['digest'], 'sourceDigest': execute.source_digest(),
            'observerSourceDigest': self.observer.source_digest, 'target': 'sgp',
            'hostname': execute.HOSTS['sgp'], 'runId': 'synthetic-run-001',
            'notBefore': (NOW - dt.timedelta(minutes=1)).isoformat(),
            'expiresAt': (NOW + dt.timedelta(hours=1)).isoformat(),
            'quarantinePath': str(self.quarantine / 'synthetic-run-001'),
            'receiptPath': str(self.receipts / 'synthetic-run-001.jsonl'),
            'candidatePaths': list(self.candidates)}

    def apply(self, **kwargs):
        return execute.execute(self.document, self.approval, observer=self.observer,
            apply=True, clock=lambda: NOW, hostname=lambda: execute.HOSTS['sgp'], **kwargs)

    def events(self):
        return [json.loads(line) for line in Path(self.approval['receiptPath']).read_text().splitlines()]

    def test_default_dry_run_no_receipt_quarantine_or_deletion(self):
        result = execute.execute(self.document)
        self.assertEqual(result['state'], 'dry_run')
        self.assertEqual(result['candidateCount'], 3)
        self.assertEqual(list(self.receipts.iterdir()), [])
        self.assertEqual(list(self.quarantine.iterdir()), [])
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_slow_final_observer_crosses_expiry_no_unlink(self):
        expired = [False]
        def slow_observer(_):
            if Path(self.approval['receiptPath']).exists() and any(row['event'] == 'quarantined' for row in self.events()):
                expired[0] = True
        self.observer.on_call = slow_observer
        result = execute.execute(self.document, self.approval, observer=self.observer,
            apply=True, clock=lambda: NOW + dt.timedelta(hours=2) if expired[0] else NOW,
            hostname=lambda: execute.HOSTS['sgp'])
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 1)
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')

    def test_slow_move_receipt_crosses_expiry_no_rename(self):
        expired = [False]
        append = execute.Receipt.append
        def slow_append(receipt, event):
            append(receipt, event)
            if event['event'] == 'move_intent':
                expired[0] = True
        with unittest.mock.patch.object(execute.Receipt, 'append', slow_append):
            result = execute.execute(self.document, self.approval, observer=self.observer,
                apply=True, clock=lambda: NOW + dt.timedelta(hours=2) if expired[0] else NOW,
                hostname=lambda: execute.HOSTS['sgp'])
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 0)
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_two_batches_complete_preserve_protected_and_subset(self):
        self.approval['candidatePaths'] = self.candidates[:2]
        before = {path: execute.metadata(os.lstat(path)) for path in self.protected + self.candidates[2:]}
        result = self.apply(batch_size=1)
        self.assertEqual(result['state'], 'completed')
        self.assertEqual(result['deletedCount'], 2)
        self.assertEqual({path: execute.metadata(os.lstat(path)) for path in before}, before)
        self.assertTrue(all(not Path(path).exists() for path in self.candidates[:2]))
        self.assertEqual(list(Path(self.approval['quarantinePath']).iterdir()), [])
        self.assertEqual([row['event'] for row in self.events()].count('batch_verified'), 2)
        self.assertGreaterEqual(self.observer.calls, 5)

    def test_receipt_consumed_cannot_replay(self):
        self.assertEqual(self.apply()['state'], 'completed')
        with self.assertRaises(FileExistsError):
            self.apply()

    def test_missing_observer_and_wrong_source_no_claim(self):
        with self.assertRaises(execute.ExecuteError):
            execute.execute(self.document, self.approval, apply=True, clock=lambda: NOW, hostname=lambda: execute.HOSTS['sgp'])
        self.approval['sourceDigest'] = '0' * 64
        with self.assertRaises(execute.ExecuteError):
            self.apply()
        self.assertEqual(list(self.receipts.iterdir()), [])

    def test_expired_approval_and_wrong_hostname_refuse(self):
        self.approval['expiresAt'] = NOW.isoformat()
        with self.assertRaises(execute.ExecuteError):
            self.apply()
        self.approval['expiresAt'] = (NOW + dt.timedelta(minutes=1)).isoformat()
        with self.assertRaises(execute.ExecuteError):
            execute.execute(self.document, self.approval, observer=self.observer, apply=True, clock=lambda: NOW, hostname=lambda: 'not-the-bound-host')
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_scope_escape_or_protected_selection_refuse(self):
        for path in ('/etc/passwd', self.protected[0]):
            self.approval['candidatePaths'] = [path]
            with self.assertRaises(execute.ExecuteError):
                self.apply()
        self.assertEqual(list(self.receipts.iterdir()), [])

    def test_rehashed_manifest_cannot_mark_recent_twenty_as_candidates(self):
        document = copy.deepcopy(self.document)
        next(row for row in document['entries'] if row['path'] == self.protected[0])['disposition'] = 'candidate'
        document['digest'] = execute.canonical_digest(document)
        with self.assertRaises(execute.ExecuteError):
            execute.execute(document)

    def test_new_file_and_protection_drift_reject_before_move(self):
        (self.protocol / 'new-unknown-file').touch()
        result = self.apply()
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(all(Path(path).exists() for path in self.candidates))
        self.assertNotIn('move_intent', [event['event'] for event in self.events()])

    def test_protection_proof_changed_even_if_old_manifest_says_complete(self):
        self.observer.review = {**self.review, 'evidenceDigest': 'c' * 64}
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')

    def test_protected_metadata_changed_rejects(self):
        os.chmod(self.protected[0], 0o640)
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(Path(self.protected[0]).exists())

    def test_symlink_replacement_rejected_and_target_preserved(self):
        path = Path(self.candidates[0])
        path.unlink()
        path.symlink_to(self.protected[0])
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(Path(self.protected[0]).exists())
        self.assertTrue(path.is_symlink())

    def test_hardlink_change_rejected(self):
        os.link(self.candidates[0], self.base / 'extra-link')
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(Path(self.candidates[0]).exists())

    def test_rename_race_mismatch_preserved_in_quarantine(self):
        real = execute.rename_no_replace
        def race(source_fd, name, destination_fd, slot):
            os.unlink(name, dir_fd=source_fd)
            fd = os.open(name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600, dir_fd=source_fd)
            os.write(fd, b'replacement must remain recoverable')
            os.close(fd)
            real(source_fd, name, destination_fd, slot)
        with unittest.mock.patch.object(execute, 'rename_no_replace', race):
            result = self.apply()
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 1)
        remaining = list(Path(self.approval['quarantinePath']).iterdir())
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0].read_bytes(), b'replacement must remain recoverable')

    def test_second_move_failure_records_partial_without_retry(self):
        real = execute.rename_no_replace
        count = 0
        def fail_second(*args):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError('SECRET PRIVATE PATH must not be printed')
            real(*args)
        with unittest.mock.patch.object(execute, 'rename_no_replace', fail_second):
            result = self.apply()
        self.assertEqual(count, 2)
        self.assertEqual(result['deletedCount'], 1)
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertTrue(Path(self.candidates[1]).exists())
        self.assertNotIn('SECRET', Path(self.approval['receiptPath']).read_text())
        self.assertEqual([row['event'] for row in self.events()].count('deleted'), 1)

    def test_protection_change_during_snapshot_refuses_before_move(self):
        def change_review(call):
            if call == 2:
                self.observer.review = {**self.review, 'evidenceDigest': 'c' * 64}
        self.observer.on_call = change_review
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual([row['event'] for row in self.events()].count('move_intent'), 0)

    def test_directory_replaced_after_move_keeps_quarantined_object(self):
        real = execute.rename_no_replace
        archived = self.root / 'not-an-approved-live-directory'
        def swap_directory(*args):
            real(*args)
            self.protocol.rename(archived)
            self.protocol.mkdir()
        with unittest.mock.patch.object(execute, 'rename_no_replace', swap_directory):
            result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 1)

    def test_expiry_between_files_stops_without_second_move(self):
        real = execute.rename_no_replace
        current = [NOW]
        def expire(*args):
            real(*args)
            current[0] = NOW + dt.timedelta(hours=2)
        with unittest.mock.patch.object(execute, 'rename_no_replace', expire):
            result = execute.execute(self.document, self.approval, observer=self.observer, apply=True,
                clock=lambda: current[0], hostname=lambda: execute.HOSTS['sgp'])
        self.assertLessEqual(result['deletedCount'], 1)
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertTrue(Path(self.candidates[1]).exists())

    def test_receipt_failure_before_move_does_not_delete(self):
        real = execute.Receipt.append
        def fail_intent(receipt, event):
            if event['event'] == 'move_intent':
                raise OSError('fixture write error')
            return real(receipt, event)
        with unittest.mock.patch.object(execute.Receipt, 'append', fail_intent):
            result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_new_hold_inside_batch_stops_before_next_move(self):
        def add_hold(call):
            receipt = Path(self.approval['receiptPath'])
            if receipt.exists() and any(row['event'] == 'deleted' for row in self.events()):
                self.observer.review = {**self.review, 'evidenceDigest': 'c' * 64}
        self.observer.on_call = add_hold
        result = self.apply(batch_size=1000)
        self.assertEqual(result['deletedCount'], 1)
        self.assertTrue(Path(self.candidates[1]).exists())
        self.assertEqual([row['event'] for row in self.events()].count('move_intent'), 1)

    def test_new_hold_after_quarantine_stops_before_unlink(self):
        real = execute.rename_no_replace
        def new_hold(*args):
            real(*args)
            self.observer.review = {**self.review, 'evidenceDigest': 'c' * 64}
        with unittest.mock.patch.object(execute, 'rename_no_replace', new_hold):
            result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 1)

    def test_named_source_directory_checked_before_move(self):
        original = execute.verify_named_directory
        seen = []
        def verify(path, expected):
            seen.append(path)
            return original(path, expected)
        real_move = execute.rename_no_replace
        def move(*args):
            self.assertIn(str(self.protocol), seen)
            real_move(*args)
        with unittest.mock.patch.object(execute, 'verify_named_directory', verify), unittest.mock.patch.object(execute, 'rename_no_replace', move):
            result = self.apply()
        self.assertEqual(result['state'], 'completed')

    def test_quarantine_slot_noreplace_does_not_overwrite_existing(self):
        source_fd = execute.retention.open_directory(str(self.protocol))
        dest_fd = execute.retention.open_directory(str(self.quarantine))
        (self.quarantine / 'slot').write_bytes(b'do not overwrite')
        try:
            with self.assertRaises(OSError):
                execute.rename_no_replace(source_fd, Path(self.candidates[0]).name, dest_fd, 'slot')
        finally:
            os.close(source_fd)
            os.close(dest_fd)
        self.assertEqual((self.quarantine / 'slot').read_bytes(), b'do not overwrite')
        self.assertTrue(Path(self.candidates[0]).exists())

    def service_owned_directories(self):
        if os.getuid() != 0:
            self.skipTest('root required to create exact service-owned Linux fixture')
        for directory in (self.root, self.protocol):
            os.chown(directory, 996, 987)
            os.chmod(directory, 0o700)
        for row in self.document['entries']:
            os.chown(row['path'], 996, 987)
        self.document = manifest.build_manifest(root=str(self.root), protocol_dirs=['hysteria2'],
            allowed_names=['config.json', 'config.yaml', 'config.yml'], target='sgp', observed_at=NOW,
            protection_review=self.review)
        self.assertTrue(self.document['complete'])
        self.approval['manifestDigest'] = self.document['digest']
        self.approval['directoryBindings'] = {
            row['path']: {key: row['identity'][key] for key in execute.IMMUTABLE_DIR_KEYS}
            for row in self.document['directories']}

    def test_actual_service_owned_0700_exact_bindings_complete(self):
        self.service_owned_directories()
        before = {path: execute.metadata(os.lstat(path)) for path in self.protected}
        result = self.apply(batch_size=1)
        self.assertEqual(result['state'], 'completed')
        self.assertEqual(result['deletedCount'], 3)
        self.assertEqual({path: execute.metadata(os.lstat(path)) for path in before}, before)
        for directory in (self.root, self.protocol):
            self.assertEqual((directory.stat().st_uid, directory.stat().st_gid), (996, 987))
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
        self.assertEqual(Path(self.approval['quarantinePath']).stat().st_uid, 0)
        self.assertEqual(Path(self.approval['receiptPath']).stat().st_uid, 0)

    def test_actual_service_owned_without_bindings_refuses_before_claim(self):
        self.service_owned_directories()
        del self.approval['directoryBindings']
        with self.assertRaisesRegex(execute.ExecuteError, 'unsafe_directory_metadata'):
            self.apply()
        self.assertFalse(Path(self.approval['receiptPath']).exists())

    def test_bound_directory_owner_or_mode_drift_refuses_before_move(self):
        self.service_owned_directories()
        os.chmod(self.protocol, 0o750)
        with self.assertRaisesRegex(execute.ExecuteError, 'directory_namespace_changed'):
            self.apply()
        self.assertFalse(Path(self.approval['receiptPath']).exists())
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_approval_directory_binding_mutation_during_observer_refuses(self):
        self.service_owned_directories()
        def mutate_binding(_):
            self.approval['directoryBindings'][str(self.protocol)]['ino'] += 1
        self.observer.on_call = mutate_binding
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_service_binding_does_not_relax_receipt_parent(self):
        self.service_owned_directories()
        os.chown(self.receipts, 996, 987)
        with self.assertRaisesRegex(execute.ExecuteError, 'root_private_parent_required'):
            self.apply()
        self.assertFalse(Path(self.approval['receiptPath']).exists())

    def test_service_binding_does_not_relax_quarantine_parent(self):
        self.service_owned_directories()
        os.chown(self.quarantine, 996, 987)
        result = self.apply()
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_directory_binding_never_permits_service_owned_ancestor_above_root(self):
        self.service_owned_directories()
        os.chown(self.base, 996, 987)
        with self.assertRaisesRegex(execute.ExecuteError, 'unsafe_directory_metadata'):
            self.apply()
        self.assertFalse(Path(self.approval['receiptPath']).exists())

    def test_bound_directory_owner_changed_by_observer_never_moves(self):
        self.service_owned_directories()
        self.observer.on_call = lambda _: os.chown(self.protocol, 997, 987)
        result = self.apply()
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertEqual(result['deletedCount'], 0)
        self.assertTrue(all(Path(path).exists() for path in self.candidates))

    def test_bound_directory_changed_after_quarantine_never_unlinks(self):
        self.service_owned_directories()
        real_move = execute.rename_no_replace
        def changed(*args):
            real_move(*args)
            os.chmod(self.protocol, 0o750)
        with unittest.mock.patch.object(execute, 'rename_no_replace', changed):
            result = self.apply()
        self.assertEqual(result['state'], 'stopped_partial_or_unknown')
        self.assertEqual(result['deletedCount'], 0)
        self.assertEqual(result['quarantinedCount'], 1)

    def test_bound_protocol_symlink_is_never_followed(self):
        self.service_owned_directories()
        archived = self.root / 'synthetic-archived-protocol'
        self.protocol.rename(archived)
        self.protocol.symlink_to(archived, target_is_directory=True)
        with self.assertRaises(OSError):
            self.apply()
        self.assertFalse(Path(self.approval['receiptPath']).exists())
        self.assertEqual(len(list(archived.iterdir())), 23)


if __name__ == '__main__':
    unittest.main()
