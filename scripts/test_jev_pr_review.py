"""Unit tests for scripts/jev_pr_review.py (stdlib unittest).

Run from the repository root with:
  python3 -m unittest discover -s scripts -p 'test_*.py' -v

(The package-style `python3 -m unittest scripts.test_jev_pr_review` form
does NOT work here - scripts/ has no __init__.py and jev_pr_review.py
imports urllib/argparse as a plain top-level script, not a package member -
so don't document it as a supported invocation.)
"""

import json
import unittest
from unittest import mock

import jev_pr_review as jpr


SHA = "d3d84a0c86a1843c73f10f0a8b71a83afa35a175"


class LoadPrContextTest(unittest.TestCase):
    def setUp(self):
        self.meta_json = json.dumps(
            {
                "number": 140,
                "title": "t",
                "url": "u",
                "baseRefName": "main",
                "headRefName": "branch",
                "headRefOid": SHA,
            }
        )
        self.diff = "--- a/README.md\n+++ b/README.md\n@@ +lag\n+hi\n"

    def _mock_gh(self, *returns):
        patcher = mock.patch.object(jpr, "gh", side_effect=list(returns))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_happy_path_returns_metadata_and_diff(self):
        self._mock_gh(self.meta_json, self.diff, SHA)
        meta, diff = jpr.load_pr_context(140, "kamper83-stack/packing-app")
        self.assertEqual(meta["number"], 140)
        self.assertEqual(meta["headRefOid"], SHA)
        self.assertEqual(diff, self.diff)

    def test_toctou_head_changed_aborts(self):
        self._mock_gh(self.meta_json, self.diff, "xyz" * 13)
        with self.assertRaises(RuntimeError) as ctx:
            jpr.load_pr_context(140, "kamper83-stack/packing-app")
        self.assertIn("head changed", str(ctx.exception))

    def test_oversized_diff_rejected(self):
        huge = "x" * (jpr.MAX_DIFF_CHARS + 1)
        self._mock_gh(self.meta_json, huge, SHA)
        with self.assertRaises(RuntimeError) as ctx:
            jpr.load_pr_context(140, "kamper83-stack/packing-app")
        self.assertIn("review limit", str(ctx.exception))

    def test_malformed_metadata_wrapped(self):
        self._mock_gh("not json")
        with self.assertRaises(RuntimeError) as ctx:
            jpr.load_pr_context(140, "kamper83-stack/packing-app")
        self.assertIn("Could not parse", str(ctx.exception))


class RunReviewTest(unittest.TestCase):
    @mock.patch.object(jpr.urllib.request, "urlopen")
    def test_success_builds_output_dict(self, urlopen):
        urlopen.return_value.__enter__.return_value.status = 200
        urlopen.return_value.__enter__.return_value.read.return_value = json.dumps(
            {
                "model": "jev-1.13.0",
                "answers": {
                    "security_risk": {
                        "type": "choice",
                        "choice": "none",
                        "confidence": 0.9,
                    }
                },
                "usage": {"input_tokens": 10, "output_tokens": 5},
            }
        ).encode()
        meta = {
            "number": 140,
            "title": "t",
            "url": "u",
            "baseRefName": "main",
            "headRefName": "b",
            "headRefOid": SHA,
        }
        result = jpr.run_review(meta, "--- diff ---", "test-key")
        self.assertEqual(result["answers"]["security_risk"]["choice"], "none")
        urlopen.assert_called_once()


class MainGuardTest(unittest.TestCase):
    def test_questions_schema_is_valid(self):
        q = jpr.build_questions()
        self.assertEqual(q["security_risk"]["type"], "choice")
        self.assertEqual(q["boundary_and_data_integrity"]["type"], "noul")
        self.assertEqual(q["test_coverage"]["type"], "score")


if __name__ == "__main__":
    unittest.main()
