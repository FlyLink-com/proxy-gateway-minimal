"""Offline synthetic fixtures. No host, backup contents, or remote access."""
import datetime as dt
import hashlib
import importlib.util
import io
import itertools
import json
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('edge_backup_manifest', Path(__file__).with_name('edge_backup_manifest.py'))
manifest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manifest)
NOW = dt.datetime(2026, 9, 24, 12, tzinfo=dt.timezone.utc)
REVIEW = {'complete': True, 'evidenceDigest': 'a' * 64, 'holds': []}
HISTORICAL_POLICY = {'id': 'historical-three-class-v1'}
CURRENT_POLICY = {'id': 'current-dependencies-only-v1',
                  'historicalCoverage': 'not_assessed', 'extraHolds': 'declared_only'}


def filename(moment, basename='config.json'):
    return basename + '.' + moment.strftime('%Y_%m_%dT%H_%M_%S_') + f'{moment.microsecond // 1000:03d}Z.bak'


@unittest.skipUnless(hasattr(os, 'O_DIRECTORY'), 'POSIX descriptor traversal')
class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / 'edge'
        self.root.mkdir(mode=0o700)
        for protocol in manifest.PROTOCOL_DIRS:
            (self.root / protocol).mkdir()
        self.guard = patch.object(manifest, 'PRODUCTION_ROOT', str(self.root))
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def scope(self, dirs=('xray',)):
        return {'root': str(self.root), 'protocolDirs': list(dirs),
                'allowedNames': ['config.json', 'config.yaml', 'config.yml'], 'target': 'sgp'}

    def backup(self, age=40, index=0, protocol='xray', basename='config.json'):
        moment = NOW - dt.timedelta(days=age, milliseconds=index)
        path = self.root / protocol / filename(moment, basename)
        path.write_bytes(b'fixture-not-for-reading')
        os.utime(path, ns=(manifest.epoch_ns(moment), manifest.epoch_ns(moment)))
        return path

    def build(self, *, review=None, dirs=('xray',), **kwargs):
        scope = self.scope(dirs)
        return manifest.build_manifest(root=scope['root'], protocol_dirs=scope['protocolDirs'],
            allowed_names=scope['allowedNames'], target='sgp', observed_at=NOW,
            protection_review=REVIEW if review is None else review, **kwargs)

    def test_full_exact_entries_metadata_and_canonical_digest(self):
        paths = [self.backup(index=i) for i in range(22)]
        result = self.build()
        self.assertTrue(result['complete'])
        self.assertEqual({row['path'] for row in result['entries']}, set(map(str, paths)))
        self.assertEqual(result['summary']['candidateCount'], 2)
        self.assertEqual(result['summary']['protectedCount'], 20)
        self.assertFalse(result['deletionApproved'])
        for row in result['entries']:
            self.assertEqual(set(row['metadata']), set(manifest.METADATA_KEYS))
            self.assertTrue(all(type(value) is int for value in row['metadata'].values()))
        self.assertEqual(result['digest'], manifest.manifest_digest(result))
        mutated = json.loads(json.dumps(result))
        mutated['entries'][0]['metadata']['size'] += 1
        self.assertNotEqual(result['digest'], manifest.manifest_digest(mutated))

    def test_latest_twenty_per_protocol_and_basename(self):
        for protocol in manifest.PROTOCOL_DIRS:
            for base in ('config.json', 'config.yaml'):
                for index in range(21):
                    self.backup(index=index, protocol=protocol, basename=base)
        result = self.build(dirs=manifest.PROTOCOL_DIRS)
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['candidateCount'], 12)
        self.assertEqual(result['summary']['protectedCount'], 240)

    def test_exact_thirty_days_is_protected(self):
        for index in range(20):
            self.backup(age=1, index=index)
        boundary = self.backup(age=30)
        outside = self.backup(age=30, index=1)
        result = self.build()
        rows = {row['path']: row for row in result['entries']}
        self.assertEqual(rows[str(boundary)]['disposition'], 'protected')
        self.assertIn('within_30_days', rows[str(boundary)]['reasons'])
        self.assertEqual(rows[str(outside)]['disposition'], 'candidate')

    def test_unknown_files_are_fully_listed_but_protected(self):
        path = self.root / 'xray' / 'unknown-file'
        path.write_bytes(b'not-read')
        result = self.build()
        self.assertTrue(result['complete'])
        self.assertEqual(result['entries'][0]['path'], str(path))
        self.assertEqual(result['entries'][0]['disposition'], 'protected')
        self.assertIn('unknown_filename', result['entries'][0]['reasons'])

    def test_future_invalid_date_and_mtime_drift_are_protected(self):
        self.backup(age=-1)
        drift = self.backup(age=40)
        os.utime(drift, ns=(manifest.epoch_ns(NOW), manifest.epoch_ns(NOW)))
        (self.root / 'xray' / 'config.json.2026_02_30T00_00_00_000Z.bak').write_bytes(b'x')
        result = self.build()
        self.assertEqual(result['summary']['candidateCount'], 0)
        self.assertEqual(result['summary']['protectedCount'], 3)

    def test_reviewed_file_or_directory_holds_override_age(self):
        files = [self.backup(index=i) for i in range(22)]
        review = {**REVIEW, 'holds': [str(files[-1])]}
        result = self.build(review=review)
        self.assertEqual(result['summary']['candidateCount'], 1)
        result = self.build(review={**REVIEW, 'holds': [str(self.root / 'xray')]})
        self.assertEqual(result['summary']['candidateCount'], 0)

    def test_missing_review_refuses_before_filesystem(self):
        with patch.object(manifest, 'open_directory', side_effect=AssertionError('unexpected I/O')):
            with self.assertRaises(manifest.ManifestError):
                manifest.build_manifest(root=str(self.root), protocol_dirs=['xray'],
                    allowed_names=['config.json'], target='sgp', observed_at=NOW, protection_review=None)

    def test_incomplete_review_or_missing_hold_blocks_all_candidates(self):
        for index in range(21):
            self.backup(index=index)
        for review in ({**REVIEW, 'complete': False}, {**REVIEW, 'holds': [str(self.root / 'xray' / 'missing')]}):
            result = self.build(review=review)
            self.assertFalse(result['complete'])
            self.assertEqual(result['summary']['candidateCount'], 0)
            self.assertTrue(all(row['disposition'] == 'protected' for row in result['entries']))

    def test_root_files_and_unselected_directory_remain_out_of_scope(self):
        (self.root / 'unselected').mkdir()
        (self.root / 'root-file').write_bytes(b'not-read')
        self.backup()
        result = self.build()
        self.assertTrue(result['complete'])
        self.assertEqual(len(result['entries']), 1)
        self.assertIn('root_files_and_unselected_directories_protected_out_of_scope', result['limitations'])

    def test_nested_directory_or_links_block_complete_manifest(self):
        self.backup()
        nested = self.root / 'xray' / 'nested'
        nested.mkdir()
        result = self.build()
        self.assertFalse(result['complete'])
        self.assertIn('nested_directory', result['blockers'])
        nested.rmdir()
        os.symlink('/etc/shadow', nested)
        result = self.build()
        self.assertFalse(result['complete'])
        self.assertIn('symbolic_link', result['blockers'])

    def test_hardlinks_are_protected_and_block_complete(self):
        path = self.backup()
        os.link(path, self.root / 'xray' / 'another')
        result = self.build()
        self.assertFalse(result['complete'])
        self.assertEqual(result['summary']['protectedCount'], 2)

    def test_cross_device_entry_blocks_complete_snapshot(self):
        self.backup()
        real_metadata = manifest._metadata
        def foreign_file(info):
            result = real_metadata(info)
            if manifest.stat.S_ISREG(result['mode']):
                result['dev'] += 1
            return result
        with patch.object(manifest, '_metadata', side_effect=foreign_file):
            result = manifest.snapshot_metadata(self.scope(), observed_at=NOW)
        self.assertFalse(result['complete'])
        self.assertIn('cross_device_entry', result['blockers'])
        planned = manifest.manifest_from_snapshot(result, protection_review=REVIEW)
        self.assertFalse(planned['complete'])
        self.assertEqual(planned['summary']['candidateCount'], 0)

    def test_safe_root_ancestor_and_selected_dir_no_follow(self):
        os.symlink(self.root, self.root.parent / 'link')
        with self.assertRaises(OSError):
            manifest.open_directory(str(self.root.parent / 'link'))
        (self.root / 'xray').rmdir()
        os.symlink('/etc', self.root / 'xray')
        result = self.build()
        self.assertFalse(result['complete'])
        self.assertEqual(result['entries'], [])

    def test_missing_selected_directory_blocks(self):
        (self.root / 'xray').rmdir()
        self.assertFalse(self.build()['complete'])

    def test_each_budget_suppresses_candidates(self):
        for index in range(22):
            self.backup(index=index)
        for kwargs in ({'max_entries': 3}, {'max_bytes': 1000}):
            result = self.build(**kwargs)
            self.assertFalse(result['complete'])
            self.assertEqual(result['summary']['candidateCount'], 0)
        with patch.object(manifest.time, 'monotonic', side_effect=itertools.chain([0, 0], itertools.repeat(2))):
            result = self.build(max_seconds=1)
        self.assertFalse(result['complete'])

    def test_two_pass_metadata_mutation_blocks(self):
        path = self.backup()
        original = manifest._scan
        calls = 0
        def changed(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                os.utime(path, ns=(manifest.epoch_ns(NOW), manifest.epoch_ns(NOW)))
            yield from original(*args, **kwargs)
        with patch.object(manifest, '_scan', side_effect=changed):
            result = self.build()
        self.assertFalse(result['complete'])
        self.assertIn('metadata_changed_between_passes', result['blockers'])

    def test_snapshot_does_not_recompute_retention_or_read_bodies(self):
        self.backup()
        original_open = manifest.os.open
        def directories_only(path, flags, *args, **kwargs):
            self.assertTrue(flags & os.O_DIRECTORY)
            self.assertTrue(flags & os.O_NOFOLLOW)
            return original_open(path, flags, *args, **kwargs)
        with patch.object(manifest.os, 'read', side_effect=AssertionError('body read')), \
             patch.object(manifest.os, 'open', side_effect=directories_only):
            result = manifest.snapshot_metadata(self.scope(), observed_at=NOW)
        self.assertTrue(result['complete'])
        self.assertNotIn('policy', result)
        self.assertNotIn('protectionReview', result)
        self.assertEqual(set(result['entries'][0]), {'path', 'metadata'})
        self.assertEqual(result['digest'], manifest.manifest_digest(result))

    def test_fingerprint_snapshot_matches_full_without_retaining_entries(self):
        for index in range(24):
            self.backup(index=index)
        full = manifest.snapshot_metadata(self.scope(), observed_at=NOW)
        fingerprint = manifest.snapshot_metadata(self.scope(), observed_at=NOW, mode='fingerprint')
        self.assertTrue(fingerprint['complete'])
        self.assertEqual(fingerprint['entries'], [])
        self.assertEqual(fingerprint['entriesFingerprint'], full['entriesFingerprint'])
        self.assertEqual(fingerprint['directories'], full['directories'])
        self.assertEqual(fingerprint['entriesFingerprint'], manifest.entries_fingerprint(iter(full['entries'])))

    def test_memory_budget_is_explicitly_incomplete(self):
        self.backup()
        result = self.build(max_memory_bytes=65536)
        self.assertFalse(result['complete'])
        self.assertIn('manifest_resource_budget_exhausted', result['blockers'])
        self.assertEqual(result['summary']['candidateCount'], 0)

    def test_directory_replaced_between_stat_and_open_is_not_followed(self):
        self.backup()
        original = manifest.os.open
        switched = False
        def raced(path, flags, *args, **kwargs):
            nonlocal switched
            if path == 'xray' and not switched:
                switched = True
                os.rename(self.root / 'xray', self.root.parent / 'moved')
                os.symlink('/etc', self.root / 'xray')
            return original(path, flags, *args, **kwargs)
        with patch.object(manifest.os, 'open', side_effect=raced):
            result = self.build()
        self.assertFalse(result['complete'])
        self.assertEqual(result['entries'], [])

    def test_private_export_is_exclusive_and_never_inside_backup_root(self):
        self.backup()
        result = self.build()
        output = self.root.parent / 'manifest.json'
        manifest.export_private(result, str(output))
        self.assertEqual(output.stat().st_mode & 0o777, 0o600)
        self.assertEqual(json.loads(output.read_text())['digest'], result['digest'])
        with self.assertRaises(FileExistsError):
            manifest.export_private(result, str(output))
        with self.assertRaises(manifest.ManifestError):
            manifest.export_private(result, str(self.root / 'output.json'))
        public = self.root.parent / 'public'
        public.mkdir(mode=0o755)
        with self.assertRaises(manifest.ManifestError):
            manifest.export_private(result, str(public / 'output.json'))

    def test_over_500k_fingerprint_rows_are_streamed_without_full_list(self):
        count = 500005
        def stream(root_fd, scope, budget):
            root_metadata = manifest.metadata_from_stat(os.fstat(root_fd))
            yield 'directory', {'path': scope['root'], 'identity': root_metadata}
            yield 'directory', {'path': scope['root'] + '/xray', 'identity': root_metadata}
            for index in range(count):
                budget['count'] += 1
                metadata = dict(zip(manifest.METADATA_KEYS, (1, index + 1, 0o100600, 1, 0, 0, 22, 1, 1, 8)))
                yield 'entry', {'path': scope['root'] + '/xray/fixture-' + str(index), 'metadata': metadata}
        with patch.object(manifest, '_scan', side_effect=stream):
            result = manifest.snapshot_metadata(self.scope(), observed_at=NOW, mode='fingerprint')
        self.assertTrue(result['complete'])
        self.assertEqual(result['entries'], [])
        self.assertEqual(result['entriesFingerprint']['count'], count)
        self.assertEqual(result['resourceAccounting']['estimatedResidentBytes'], 65536)


class ContractTests(unittest.TestCase):
    def snapshot(self, count=22, *, protocol='xray', target='sgp'):
        scope = {'root': manifest.PRODUCTION_ROOT, 'protocolDirs': [protocol],
                 'allowedNames': ['config.json'], 'target': target}
        directory_metadata = dict(zip(manifest.METADATA_KEYS, (1, 1, 0o40700, 2, 0, 0, 4096, 1, 1, 8)))
        directories = [{'path': manifest.PRODUCTION_ROOT, 'identity': directory_metadata},
                       {'path': manifest.PRODUCTION_ROOT + '/' + protocol,
                        'identity': {**directory_metadata, 'ino': 2}}]
        rows = []
        for index in range(count):
            moment = NOW - dt.timedelta(days=40, milliseconds=index)
            metadata = dict(zip(manifest.METADATA_KEYS,
                (1, index + 3, 0o100600, 1, 0, 0, 22, manifest.epoch_ns(moment), 1, 8)))
            rows.append({'path': manifest.PRODUCTION_ROOT + '/' + protocol + '/' + filename(moment),
                         'metadata': metadata})
        rows.reverse()
        snapshot = {'schemaVersion': 1, 'type': 'edge-backup-metadata-snapshot', 'mode': 'full',
            'scope': scope, 'observedAt': NOW.isoformat(), 'complete': True, 'directories': directories,
            'entries': rows, 'entriesFingerprint': manifest.entries_fingerprint(rows),
            'summary': {'entryCount': count, 'logicalBytes': count * 22}, 'blockers': [],
            'limitations': [manifest.LIMITATION, 'metadata_stability_not_atomic_snapshot'],
            'resourceAccounting': {'estimatedResidentBytes': 0, 'estimatedPayloadBytes': 0,
                                   'maxMemoryBytes': manifest.MAX_MEMORY_BYTES, 'maxPayloadBytes': manifest.MAX_BYTES}}
        snapshot['digest'] = manifest.manifest_digest(snapshot)
        return snapshot

    def test_protection_policy_defaults_to_explicit_historical_policy(self):
        scope = self.snapshot()['scope']
        for value in (None, HISTORICAL_POLICY):
            with self.subTest(value=value):
                normalized = manifest.validate_protection_policy(value, scope)
                self.assertEqual(normalized, HISTORICAL_POLICY)
                self.assertIsNot(normalized, HISTORICAL_POLICY)
        default = manifest.manifest_from_snapshot(self.snapshot(), protection_review=REVIEW)
        explicit = manifest.manifest_from_snapshot(self.snapshot(), protection_review=REVIEW,
                                                  protection_policy=HISTORICAL_POLICY)
        self.assertEqual(default['protectionPolicy'], HISTORICAL_POLICY)
        self.assertEqual(default, explicit)

    def test_current_protection_policy_is_pure_canonical_and_digest_bound(self):
        with patch.object(manifest.os, 'open', side_effect=AssertionError('pure function did I/O')):
            result = manifest.manifest_from_snapshot(self.snapshot(protocol='hysteria2'),
                protection_review=REVIEW, protection_policy=CURRENT_POLICY)
        self.assertTrue(result['complete'])
        self.assertEqual(result['protectionPolicy'], CURRENT_POLICY)
        self.assertIsNot(result['protectionPolicy'], CURRENT_POLICY)
        self.assertEqual(result['digest'], manifest.manifest_digest(result))
        changed = {**result, 'protectionPolicy': HISTORICAL_POLICY}
        self.assertNotEqual(result['digest'], manifest.manifest_digest(changed))
        for key in ('historicalCoverage', 'extraHolds'):
            changed = {**result, 'protectionPolicy': {**CURRENT_POLICY, key: 'changed'}}
            self.assertNotEqual(result['digest'], manifest.manifest_digest(changed))

    def test_protection_policy_schema_is_exact(self):
        scope = self.snapshot(protocol='hysteria2')['scope']
        invalid = (False, 1, 'historical-three-class-v1', [], {},
            {'id': 'unknown'}, {'id': None}, {'id': []},
            {**HISTORICAL_POLICY, 'extraHolds': 'declared_only'},
            {'id': CURRENT_POLICY['id']}, {**CURRENT_POLICY, 'extra': True},
            {**CURRENT_POLICY, 'historicalCoverage': 'assessed'},
            {**CURRENT_POLICY, 'historicalCoverage': False},
            {**CURRENT_POLICY, 'extraHolds': 'all'}, {**CURRENT_POLICY, 'extraHolds': []})
        for value in invalid:
            with self.subTest(value=value), self.assertRaisesRegex(
                    manifest.ManifestError, '^invalid_protection_policy$'):
                manifest.validate_protection_policy(value, scope)

    def test_current_protection_policy_is_limited_to_sgp_hysteria2(self):
        scope = self.snapshot(protocol='hysteria2')['scope']
        for change in ({'target': 'jp'}, {'protocolDirs': ['xray']},
                       {'protocolDirs': ['hysteria2', 'xray']}):
            with self.subTest(change=change), self.assertRaisesRegex(
                    manifest.ManifestError, '^protection_policy_scope_mismatch$'):
                manifest.validate_protection_policy(CURRENT_POLICY, {**scope, **change})
        for protocol, target in (('xray', 'sgp'), ('hysteria2', 'jp')):
            snapshot = self.snapshot(protocol=protocol, target=target)
            with self.subTest(protocol=protocol, target=target), self.assertRaisesRegex(
                    manifest.ManifestError, '^protection_policy_scope_mismatch$'):
                manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW,
                                                protection_policy=CURRENT_POLICY)
            self.assertTrue(all('disposition' not in row for row in snapshot['entries']))

    def test_protection_policies_preserve_latest_twenty_thirty_days_and_holds(self):
        snapshot = self.snapshot(24, protocol='hysteria2')
        moments = [NOW - dt.timedelta(days=1, milliseconds=index) for index in range(20)]
        moments += [NOW - dt.timedelta(days=30), NOW - dt.timedelta(days=30, milliseconds=1),
                    NOW - dt.timedelta(days=40), NOW - dt.timedelta(days=41)]
        directory = manifest.PRODUCTION_ROOT + '/hysteria2/'
        for row, moment in zip(snapshot['entries'], moments):
            row['path'] = directory + filename(moment)
            row['metadata']['mtimeNs'] = manifest.epoch_ns(moment)
        snapshot['entries'].sort(key=lambda row: row['path'])
        snapshot['entriesFingerprint'] = manifest.entries_fingerprint(snapshot['entries'])
        snapshot['digest'] = manifest.manifest_digest(snapshot)
        held = directory + filename(moments[-2])
        results = [manifest.manifest_from_snapshot(json.loads(json.dumps(snapshot)),
            protection_review={**REVIEW, 'holds': [held]}, protection_policy=policy)
            for policy in (HISTORICAL_POLICY, CURRENT_POLICY)]
        historical, current = results
        self.assertTrue(current['complete'])
        self.assertEqual(current['policy'], {'keepLatest': 20, 'keepDays': 30, 'mtimeToleranceSeconds': 300})
        self.assertEqual(current['summary']['candidateCount'], 2)
        self.assertEqual(current['summary']['protectedCount'], 22)
        self.assertEqual(current['entries'], historical['entries'])
        self.assertEqual(current['summary'], historical['summary'])
        self.assertEqual(current['protectionReview'], historical['protectionReview'])
        rows = {row['path']: row for row in current['entries']}
        self.assertEqual(rows[held]['reasons'], ['reviewed_hold'])
        self.assertEqual(rows[directory + filename(moments[-4])]['reasons'], ['within_30_days'])
        self.assertEqual(sum('latest_20' in row['reasons'] for row in rows.values()), 20)

    def test_build_rejects_invalid_protection_policy_before_scanning(self):
        for policy, protocol, reason in (({'id': 'unknown'}, 'hysteria2', 'invalid_protection_policy'),
                                         (CURRENT_POLICY, 'xray', 'protection_policy_scope_mismatch')):
            with self.subTest(policy=policy, protocol=protocol), patch.object(
                    manifest, 'snapshot_metadata', side_effect=AssertionError('unexpected scan')) as scan:
                with self.assertRaisesRegex(manifest.ManifestError, '^' + reason + '$'):
                    manifest.build_manifest(root=manifest.PRODUCTION_ROOT, protocol_dirs=[protocol],
                        allowed_names=['config.json'], target='sgp', observed_at=NOW,
                        protection_review=REVIEW, protection_policy=policy)
                scan.assert_not_called()

    def test_build_binds_canonical_protection_policy(self):
        for policy in (None, HISTORICAL_POLICY, CURRENT_POLICY):
            with self.subTest(policy=policy), patch.object(manifest, 'snapshot_metadata',
                    return_value=self.snapshot(protocol='hysteria2')) as scan:
                result = manifest.build_manifest(root=manifest.PRODUCTION_ROOT, protocol_dirs=['hysteria2'],
                    allowed_names=['config.json'], target='sgp', observed_at=NOW,
                    protection_review=REVIEW, protection_policy=policy)
                scan.assert_called_once()
                self.assertEqual(result['protectionPolicy'], HISTORICAL_POLICY if policy is None else policy)
                self.assertEqual(result['digest'], manifest.manifest_digest(result))

    def test_pure_manifest_uses_same_entry_list_without_filesystem(self):
        snapshot = self.snapshot()
        rows = snapshot['entries']
        with patch.object(manifest.os, 'open', side_effect=AssertionError('pure function did I/O')):
            result = manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)
        self.assertIs(result['entries'], rows)
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['candidateCount'], 2)

    def test_false_snapshot_or_structural_link_cannot_become_complete(self):
        for change in ('incomplete', 'link'):
            snapshot = self.snapshot()
            if change == 'incomplete':
                snapshot['complete'] = False
            else:
                snapshot['entries'][0]['metadata']['mode'] = 0o120777
                snapshot['entriesFingerprint'] = manifest.entries_fingerprint(snapshot['entries'])
            snapshot['digest'] = manifest.manifest_digest(snapshot)
            result = manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)
            self.assertFalse(result['complete'])
            self.assertEqual(result['summary']['candidateCount'], 0)

    def test_pure_snapshot_rejects_tampering_duplicate_and_outside_path(self):
        for change in ('digest', 'duplicate', 'path', 'metadata'):
            snapshot = self.snapshot()
            if change == 'digest':
                snapshot['digest'] = '0' * 64
            elif change == 'duplicate':
                snapshot['entries'][0] = snapshot['entries'][1]
            elif change == 'path':
                snapshot['entries'][0]['path'] = '/etc/shadow'
            else:
                snapshot['entries'][0]['metadata']['nlink'] = True
            if change != 'digest':
                snapshot['digest'] = manifest.manifest_digest(snapshot)
            with self.assertRaises(manifest.ManifestError):
                manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)

    def test_pure_snapshot_rejects_cross_device_directory(self):
        snapshot = self.snapshot()
        snapshot['directories'][1]['identity']['dev'] += 1
        snapshot['digest'] = manifest.manifest_digest(snapshot)
        with self.assertRaisesRegex(manifest.ManifestError, 'cross_device_directory'):
            manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)

    def test_pure_snapshot_rejects_cross_device_entry(self):
        snapshot = self.snapshot()
        snapshot['entries'][0]['metadata']['dev'] += 1
        snapshot['entriesFingerprint'] = manifest.entries_fingerprint(snapshot['entries'])
        snapshot['digest'] = manifest.manifest_digest(snapshot)
        with self.assertRaisesRegex(manifest.ManifestError, 'cross_device_entry'):
            manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)

    @unittest.skipUnless(os.name == 'posix', 'Linux RSS scale measurement')
    def test_230000_synthetic_rows_one_list_and_peak_rss(self):
        import resource
        started = time.monotonic()
        snapshot = self.snapshot(230000)
        original_rows = snapshot['entries']
        result = manifest.manifest_from_snapshot(snapshot, protection_review=REVIEW)
        self.assertIs(result['entries'], original_rows)
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['candidateCount'], 229980)
        print(json.dumps({'fixture': '230000_synthetic_metadata_rows_no_files',
            'elapsedSeconds': round(time.monotonic() - started, 3),
            'peakRssKiB': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))

    def test_scope_and_review_input_strict(self):
        scope = {'root': manifest.PRODUCTION_ROOT, 'protocolDirs': ['xray'],
                 'allowedNames': ['config.json'], 'target': 'sgp'}
        for change in ({'root': '/'}, {'protocolDirs': []}, {'protocolDirs': ['private']},
                       {'protocolDirs': ['xray', 'xray']}, {'allowedNames': ['secret.json']}, {'target': 'unknown'}):
            with self.assertRaises(manifest.ManifestError):
                manifest.snapshot_metadata({**scope, **change}, observed_at=NOW)

    def test_canonical_json_has_stable_key_order(self):
        one = {'unicode': '\u00e9', 'a': 1}
        two = {'a': 1, 'unicode': '\u00e9'}
        self.assertEqual(manifest.canonical_bytes(one), manifest.canonical_bytes(two))
        self.assertEqual(manifest.manifest_digest(one), hashlib.sha256(manifest.canonical_bytes(one)).hexdigest())

    def test_plan_console_is_aggregate_only(self):
        result = manifest.manifest_from_snapshot(self.snapshot(), protection_review=REVIEW)
        output = io.StringIO()
        with patch.object(manifest, 'build_manifest', return_value=result), patch('sys.stdout', output):
            code = manifest.main(['plan', '--root', manifest.PRODUCTION_ROOT, '--protocol-dir', 'xray',
                '--allow-name', 'config.json', '--target', 'sgp', '--review-evidence-digest', 'a' * 64,
                '--protection-review-complete', '--no-holds-reviewed'])
        self.assertEqual(code, 0)
        self.assertNotIn(manifest.PRODUCTION_ROOT, output.getvalue())
        self.assertNotIn('config.json.', output.getvalue())
        self.assertEqual(json.loads(output.getvalue())['summary']['candidateCount'], 2)


if __name__ == '__main__':
    unittest.main()
