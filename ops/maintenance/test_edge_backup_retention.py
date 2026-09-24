"""Synthetic fixtures only. Never accesses production backup paths."""
import datetime as dt
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('edge_backup_retention', Path(__file__).with_name('edge_backup_retention.py'))
retention = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(retention)
UTC = dt.timezone.utc
NOW = dt.datetime(2026, 9, 24, 12, tzinfo=UTC)


def name_at(moment, basename='config.json'):
    return basename + '.' + moment.strftime('%Y_%m_%dT%H_%M_%S_') + f'{moment.microsecond // 1000:03d}Z.bak'


@unittest.skipUnless(hasattr(os, 'O_DIRECTORY'), 'Linux/POSIX fd traversal required')
class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'backups'
        self.root.mkdir()
        self.guard = patch.object(retention, 'PRODUCTION_ROOT', str(self.root))
        self.guard.start()
        self.addCleanup(self.guard.stop)

    def backup(self, days=40, *, seconds=0, directory='', basename='config.json', size=7):
        moment = NOW - dt.timedelta(days=days, seconds=seconds)
        target = self.root / directory / name_at(moment, basename)
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(b'x' * size)
        os.utime(target, (moment.timestamp(), moment.timestamp()))
        return target

    def plan(self, **kwargs):
        args = dict(allowed_names=('config.json', 'config.yaml', 'config.yml'), keep_latest=1,
                    keep_days=30, now=NOW, reviewed_holds=(), protocol_dirs=(), max_seconds=120)
        args.update(kwargs)
        return retention.plan_retention(str(self.root), **args)

    def test_strict_thirty_day_boundary_and_union_with_latest(self):
        self.backup(days=30)
        self.backup(days=30, seconds=0.001)
        self.backup(days=1)
        result = self.plan(keep_latest=1)
        self.assertTrue(result['complete'])
        self.assertEqual(result['state'], 'candidate-not-approved')
        self.assertFalse(result['deletionApproved'])
        self.assertEqual(result['summary']['protected']['count'], 2)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 1)
        self.assertEqual(result['summary']['candidateNotApproved']['logicalBytes'], 7)

    def test_latest_n_protected_even_when_all_old(self):
        for day in range(40, 45):
            self.backup(days=day)
        result = self.plan(keep_latest=3)
        self.assertEqual(result['summary']['protected']['count'], 3)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 2)

    def test_protocol_and_basename_groups_do_not_compete(self):
        for directory in ('xray', 'tuic'):
            for base in ('config.json', 'config.yaml'):
                self.backup(days=50, directory=directory, basename=base)
                self.backup(days=40, directory=directory, basename=base)
        result = self.plan(protocol_dirs=('xray', 'tuic'))
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['protected']['count'], 4)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 4)

    def test_exact_hold_and_directory_hold(self):
        first = self.backup(days=50)
        self.backup(days=40)
        self.backup(days=60, directory='tuic')
        self.backup(days=45, directory='tuic')
        result = self.plan(protocol_dirs=('tuic',), reviewed_holds=(first.name, 'tuic'))
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 0)
        self.assertEqual(result['summary']['protected']['count'], 4)

    def test_holds_must_be_explicit_and_unresolved_hold_blocks(self):
        self.backup(days=45)
        with self.assertRaises(retention.PlanError):
            self.plan(reviewed_holds=None)
        result = self.plan(reviewed_holds=('missing-private-file',))
        self.assertFalse(result['complete'])
        self.assertIsNone(result['summary']['candidateNotApproved'])
        self.assertNotIn('missing-private-file', json.dumps(result))

    def test_future_invalid_unknown_and_mtime_drift_never_candidates(self):
        self.backup(days=50)
        self.backup(days=40)
        self.backup(days=-1)
        drift = self.backup(days=60)
        os.utime(drift, (NOW.timestamp(), NOW.timestamp()))
        (self.root / 'config.json.2026_02_30T12_00_00_000Z.bak').write_bytes(b'x')
        (self.root / 'customer-private-token.json').write_bytes(b'x')
        (self.root / 'custom.json.2026_07_01T00_00_00_000Z.bak').write_bytes(b'x')
        result = self.plan()
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 1)
        self.assertEqual(result['summary']['excluded']['count'], 5)
        self.assertNotIn('customer-private-token', json.dumps(result))

    def test_hardlinks_and_symlinks_are_excluded_without_following(self):
        old = self.backup(days=50)
        os.link(old, self.root / name_at(NOW - dt.timedelta(days=51)))
        os.symlink('/etc/shadow', self.root / name_at(NOW - dt.timedelta(days=52)))
        result = self.plan()
        self.assertEqual(result['summary']['excluded']['count'], 3)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 0)

    def test_unselected_and_nested_directories_make_coverage_partial(self):
        self.backup(days=50)
        self.backup(days=40)
        (self.root / 'unknown-private').mkdir()
        result = self.plan()
        self.assertFalse(result['complete'])
        self.assertIsNone(result['summary']['candidateNotApproved'])
        self.assertEqual(result['candidateSamples'], [])
        (self.root / 'unknown-private' / 'nested').mkdir()
        result = self.plan(protocol_dirs=('unknown-private',))
        self.assertFalse(result['complete'])
        self.assertNotIn('unknown-private', json.dumps(result))

    def test_safe_roots_and_directory_symlinks(self):
        for bad in ('/', str(self.root.parent), str(self.root / '..'), str(self.root / 'not-reviewed')):
            with self.assertRaises(retention.PlanError):
                retention.plan_retention(bad, allowed_names=('config.json',), keep_latest=1,
                    keep_days=30, now=NOW, reviewed_holds=())
        os.symlink(self.root, self.root.parent / 'linked')
        with self.assertRaises(OSError):
            retention.open_directory(str(self.root.parent / 'linked'))
        os.symlink('/etc', self.root / 'tuic')
        result = self.plan(protocol_dirs=('tuic',))
        self.assertFalse(result['complete'])

    def test_entry_budget_disables_candidates(self):
        self.backup(days=50)
        self.backup(days=40)
        result = self.plan(max_entries=1)
        self.assertFalse(result['complete'])
        self.assertIsNone(result['summary']['candidateNotApproved'])
        self.assertEqual(result['candidateSamples'], [])

    def test_time_budget_disables_candidates(self):
        self.backup()
        with patch.object(retention.time, 'monotonic', side_effect=[0, 2, 2, 2, 2, 2, 2, 2]):
            result = self.plan(max_seconds=1)
        self.assertFalse(result['complete'])
        self.assertIsNone(result['summary']['candidateNotApproved'])

    def test_deadline_after_last_entry_still_disables_candidates(self):
        self.backup(days=50)
        self.backup(days=40)
        with patch.object(retention.time, 'monotonic', side_effect=[0, 0, 0, 0, 0, 2]):
            result = self.plan(max_seconds=1)
        self.assertFalse(result['complete'])
        self.assertIn('scan_budget_exhausted', result['limitations'])
        self.assertIsNone(result['summary']['candidateNotApproved'])
        self.assertEqual(result['candidateSamples'], [])

    def test_two_pass_metadata_drift_disables_candidates(self):
        target = self.backup(days=50)
        self.backup(days=40)
        original = retention._scan
        calls = 0
        def changed(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2:
                os.utime(target, (NOW.timestamp(), NOW.timestamp()))
            yield from original(*args, **kwargs)
        with patch.object(retention, '_scan', side_effect=changed):
            result = self.plan()
        self.assertFalse(result['complete'])
        self.assertIn('metadata_changed_between_passes', result['limitations'])

    def test_no_file_body_read_and_sample_limit(self):
        for days in range(40, 50):
            self.backup(days=days)
        with patch.object(retention.os, 'read', side_effect=AssertionError('body read')):
            result = self.plan(sample_limit=2)
        self.assertEqual(len(result['candidateSamples']), 2)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 9)

    def test_selected_child_root_is_explicit_and_nonrecursive(self):
        self.backup(directory='reviewed-protocol')
        result = retention.plan_retention(str(self.root / 'reviewed-protocol'),
            allowed_names=('config.json',), keep_latest=1, keep_days=30, now=NOW,
            reviewed_holds=(), protocol_dirs=('reviewed-protocol',))
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['protected']['count'], 1)

    def test_child_directory_replaced_with_symlink_cannot_be_followed(self):
        self.backup(directory='tuic')
        real_open = retention.os.open
        def raced(path, flags, *args, **kwargs):
            if path == 'tuic':
                os.rename(self.root / 'tuic', self.root.parent / 'moved')
                os.symlink('/etc', self.root / 'tuic')
            return real_open(path, flags, *args, **kwargs)
        with patch.object(retention.os, 'open', side_effect=raced):
            result = self.plan(protocol_dirs=('tuic',))
        self.assertFalse(result['complete'])
        self.assertIsNone(result['summary']['candidateNotApproved'])
        self.assertEqual(result['summary']['regularFiles'], 0)

    def test_directory_and_file_metadata_are_the_only_open_targets(self):
        self.backup()
        real_open = retention.os.open
        def directories_only(path, flags, *args, **kwargs):
            self.assertTrue(flags & os.O_DIRECTORY)
            self.assertTrue(flags & os.O_NOFOLLOW)
            return real_open(path, flags, *args, **kwargs)
        with patch.object(retention.os, 'open', side_effect=directories_only):
            result = self.plan()
        self.assertTrue(result['complete'])

    def test_over_500k_entries_streamed_with_constant_retention_heap(self):
        # No 500k fixture files or rows are stored. Each pass streams metadata;
        # only the latest five scalar keys may remain in the retention index.
        count = 500005
        start = NOW - dt.timedelta(days=100)
        start_ns = retention._micros(start) * 1000
        def stream(_root_fd, _selected, budget):
            info = SimpleNamespace(st_dev=1, st_ino=0, st_mode=0o100600, st_nlink=1,
                st_uid=0, st_gid=0, st_size=11, st_mtime_ns=0, st_ctime_ns=1, st_blocks=8)
            for index in range(count):
                budget['entries'] += 1
                info.st_ino = index + 1
                info.st_mtime_ns = start_ns + index * 1000000
                yield (name_at(start + dt.timedelta(milliseconds=index)),), info
        with patch.object(retention, '_scan', side_effect=stream):
            result = self.plan(keep_latest=5, max_entries=600000, sample_limit=3)
        self.assertTrue(result['complete'])
        self.assertEqual(result['summary']['observedEntries'], count)
        self.assertEqual(result['summary']['candidateNotApproved']['count'], 500000)
        self.assertEqual(result['summary']['candidateNotApproved']['logicalBytes'], 5500000)
        self.assertEqual(result['retentionIndexEntries'], 5)
        self.assertEqual(len(result['candidateSamples']), 3)


class InputTests(unittest.TestCase):
    def test_allowlist_cannot_add_arbitrary_basename(self):
        with self.assertRaises(retention.PlanError):
            retention.plan_retention(retention.PRODUCTION_ROOT, allowed_names=('customer.json',),
                keep_latest=1, keep_days=30, now=NOW, reviewed_holds=())

    def test_cli_requires_hold_review_and_has_no_apply_mode(self):
        with patch('sys.stderr', new_callable=io.StringIO), self.assertRaises(SystemExit):
            retention.main(['--root', retention.PRODUCTION_ROOT, '--allow-name', 'config.json',
                            '--keep-latest', '5', '--keep-days', '30'])
        with patch('sys.stderr', new_callable=io.StringIO), self.assertRaises(SystemExit):
            retention.main(['--apply'])

    def test_protocol_components_and_retention_bounds_are_strict(self):
        for directory in ('../etc', 'a/b', '.hidden', 'a..b', '', '/etc'):
            with self.assertRaises(retention.PlanError):
                retention.plan_retention(retention.PRODUCTION_ROOT, allowed_names=('config.json',),
                    keep_latest=1, keep_days=30, now=NOW, reviewed_holds=(), protocol_dirs=(directory,))
        for params in ({'keep_latest': 0}, {'keep_days': 0}, {'max_seconds': float('nan')},
                       {'sample_limit': 101}, {'reviewed_holds': ('../outside',)}, {'now': NOW.replace(tzinfo=None)}):
            args = dict(allowed_names=('config.json',), keep_latest=1, keep_days=30,
                        now=NOW, reviewed_holds=())
            args.update(params)
            with self.assertRaises(retention.PlanError):
                retention.plan_retention(retention.PRODUCTION_ROOT, **args)


if __name__ == '__main__':
    unittest.main()
