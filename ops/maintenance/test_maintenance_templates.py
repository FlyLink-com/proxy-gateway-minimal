"""Offline checks only: never reads /etc or calls systemd."""
import configparser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent


class MaintenanceTemplateTests(unittest.TestCase):
    def load_template(self, name):
        parser = configparser.ConfigParser(interpolation=None)
        parser.optionxform = str
        parser.read_string((ROOT / (name + '.journald.conf.in')).read_text(encoding='utf8'))
        self.assertEqual(parser.sections(), ['Journal'])
        return dict(parser['Journal'])

    def test_control_plane_proposed_budget(self):
        self.assertEqual(self.load_template('control-plane'), {
            'SystemMaxUse': '2G', 'SystemKeepFree': '4G',
            'SystemMaxFileSize': '128M', 'RuntimeMaxUse': '128M',
            'RuntimeKeepFree': '128M', 'MaxRetentionSec': '30day',
            'Compress': 'yes',
        })

    def test_small_edge_proposed_budget(self):
        self.assertEqual(self.load_template('small-edge'), {
            'SystemMaxUse': '1G', 'SystemKeepFree': '2G',
            'SystemMaxFileSize': '64M', 'RuntimeMaxUse': '64M',
            'RuntimeKeepFree': '128M', 'MaxRetentionSec': '30day',
            'Compress': 'yes',
        })

    def test_ci_runs_the_same_synthetic_suite(self):
        workflow = (ROOT.parent.parent / '.github/workflows/ci.yml').read_text(encoding='utf8')
        self.assertIn("      - name: Run storage maintenance synthetic tests\n"
                      "        if: steps.changes.outputs.run_full != '0'\n"
                      "        run: python3 -B -m unittest discover -s ops/maintenance -p 'test_*.py' -v", workflow)

    def test_templates_do_not_change_log_routing_or_rate_limit(self):
        for name in ('control-plane', 'small-edge'):
            values = self.load_template(name)
            for key in ('Storage', 'ForwardToSyslog', 'ForwardToConsole',
                        'RateLimitBurst', 'RateLimitIntervalSec'):
                self.assertNotIn(key, values)

    def test_templates_are_inert_and_warn_about_deletion(self):
        for name in ('control-plane', 'small-edge'):
            text = (ROOT / (name + '.journald.conf.in')).read_text(encoding='utf8')
            self.assertIn('NOT INSTALLED', text)
            self.assertIn('irreversible', text)
        self.assertEqual(list(ROOT.glob('*.timer')), [])


if __name__ == '__main__':
    unittest.main()
