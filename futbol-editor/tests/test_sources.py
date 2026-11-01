"""Kaynak katmanı testleri (ağ gerektirmez; API yanıtları taklit edilir)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fe import fetch as F  # noqa: E402
from fe import sources as S  # noqa: E402

P = "Leandro Trossard"


class TestRules(unittest.TestCase):
    def test_stock_sites_blocked(self):
        for u in ("https://www.pexels.com/video/123/", "https://pixabay.com/videos/x", "https://mixkit.co/free/1",
                  "https://www.shutterstock.com/video/clip-1"):
            self.assertTrue(S.is_stock(u), u)
        self.assertFalse(S.is_stock("https://www.youtube.com/watch?v=abcdefghijk"))

    def test_title_filter(self):
        self.assertTrue(S.title_ok("Leandro Trossard - All Goals 2024/25", P))
        self.assertTrue(S.title_ok("TROSSARD skills & dribbles 4K", P))
        for bad in ("Trossard FIFA 25 career mode", "Trossard EA FC 26 gameplay", "Trossard edit 🔥",
                    "Trossard press conference", "Saka all goals"):
            self.assertFalse(S.title_ok(bad, P), bad)

    def test_queries_cover_all_categories_and_clubs(self):
        q = S.expand_queries(P, ["Arsenal", "Belgium"])
        self.assertEqual({c for c, _ in q}, set(S.CATEGORIES))
        self.assertIn(("gol_asist", "Leandro Trossard goal Arsenal"), q)
        self.assertIn(("antrenman", "Belgium training Leandro Trossard"), q)
        self.assertFalse(any("{club}" in t for _, t in S.expand_queries(P, [])))

    def test_hashtags(self):
        self.assertEqual(S.hashtags(P, ["Arsenal"])[:3], ["leandrotrossard", "trossard", "trossardarsenal"])

    def test_platform_and_permission(self):
        self.assertEqual(S.platform_of("https://x.com/Arsenal/status/1"), "x")
        self.assertEqual(S.platform_of("https://www.instagram.com/reel/abc/"), "instagram")
        c = S.Candidate("u", "t", "youtube", "youtube_api", "gol_asist", "q", license="creativeCommon")
        self.assertIn("Creative Commons", S.permission(c))
        c2 = S.Candidate("u", "t", "x", "google", "sevinc", "q", official=True)
        self.assertIn("yeniden yayın izni yok", S.permission(c2))

    def test_official_detection(self):
        self.assertTrue(S.is_official("Premier League", []))
        self.assertTrue(S.is_official("Arsenal", ["Arsenal"]))
        self.assertFalse(S.is_official("FootballEdits4K", ["Arsenal"]))

    def test_errors(self):
        self.assertEqual(S.classify_error("Tunnel connection failed: 403 Forbidden").status, "ENGELLİ")
        self.assertEqual(S.classify_error("Sign in to confirm you're not a bot").status, "GİRİŞ GEREKLİ")
        self.assertEqual(S.classify_error("Requested content is not available, rate-limit reached or login "
                                          "required").status, "GİRİŞ GEREKLİ")

    def test_rank_and_diversify(self):
        cs = [S.Candidate(f"u{i}", f"Trossard {i}", "youtube", "youtube", cat, "q", duration=120)
              for i, cat in enumerate(["calim"] * 5 + ["sevinc"] * 2 + ["antrenman"])]
        cs[6].official = True
        r = S.rank(cs)
        self.assertEqual(r[0].url, "u6")
        cats = [c.category for c in S.diversify(r, 3)]
        self.assertEqual(len(set(cats)), 3)


class TestApis(unittest.TestCase):
    def test_youtube_api_parses_license_and_duration(self):
        def fake(url, timeout=20):
            if "/search?" in url:
                return {"items": [
                    {"id": {"videoId": "AAAAAAAAAAA"}, "snippet": {"title": "Trossard all goals", "channelTitle":
                                                                   "Arsenal", "channelId": "UC1"}},
                    {"id": {"videoId": "BBBBBBBBBBB"}, "snippet": {"title": "Trossard FIFA 25", "channelTitle": "x",
                                                                   "channelId": "UC2"}}]}
            return {"items": [{"id": "AAAAAAAAAAA", "contentDetails": {"duration": "PT4M13S", "definition": "hd"},
                               "status": {"license": "creativeCommon"}}]}
        with mock.patch.dict(os.environ, {"YT_API_KEY": "k"}), mock.patch.object(S, "_http_json", fake):
            r = S.youtube_api(P, ["Arsenal"], 5, max_queries=1)
        self.assertEqual(len(r), 1)
        self.assertEqual((r[0].duration, r[0].hd, r[0].license, r[0].official), (253, True, "creativeCommon", True))

    def test_youtube_api_needs_key(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(S.ProviderError) as cm:
                S.youtube_api(P, [], 5)
        self.assertEqual(cm.exception.status, "ANAHTAR YOK")

    def test_google_keeps_only_post_urls(self):
        items = {"items": [
            {"link": "https://x.com/Arsenal/status/123", "title": "Trossard goal", "snippet": ""},
            {"link": "https://x.com/Arsenal", "title": "Arsenal profile Trossard", "snippet": ""},
            {"link": "https://www.pexels.com/video/1", "title": "Trossard", "snippet": ""},
            {"link": "https://www.instagram.com/reel/Cxyz/", "title": "", "snippet": "Leandro Trossard celebration"}]}
        with mock.patch.dict(os.environ, {"GOOGLE_API_KEY": "k", "GOOGLE_CSE_ID": "c"}), \
                mock.patch.object(S, "_http_json", lambda u, timeout=20: items):
            r = S.google(P, [], 10, max_queries=1)
        self.assertEqual(sorted(c.url for c in r),
                         ["https://www.instagram.com/reel/Cxyz/", "https://x.com/Arsenal/status/123"])


class TestDiscoverReport(unittest.TestCase):
    def test_discover_reports_each_platform(self):
        def ok(*a, **k):
            return [S.Candidate("https://www.youtube.com/watch?v=AAAAAAAAAAA", "Trossard goals", "youtube",
                                "youtube", "gol_asist", "q", official=True, extra={"channel_url": "https://yt/c/1"})]

        def blocked(*a, **k):
            raise S.ProviderError("ENGELLİ", "proxy 403")

        seen = {}

        def channels(*a, discovered=None, **k):
            seen["d"] = discovered
            return []
        fake = {"youtube_api": blocked, "youtube": ok, "channels": channels, "tiktok": blocked,
                "instagram": blocked, "google": blocked}
        with mock.patch.dict(S.PROVIDERS, fake):
            cands, status = F.discover(P, [], list(fake))
        self.assertEqual(len(cands), 1)
        self.assertEqual({s["kaynak"]: s["durum"] for s in status}["tiktok"], "ENGELLİ")
        self.assertEqual(seen["d"], ["https://yt/c/1"])  # resmî kanal keşfi kanal aramasına aktarıldı

    def test_fetch_fails_loudly_when_nothing_downloaded(self):
        with tempfile.TemporaryDirectory() as d:
            from fe.util import project_paths
            paths = project_paths(Path(d) / "p")

            def blocked(*a, **k):
                raise S.ProviderError("ENGELLİ", "proxy 403")
            with mock.patch.dict(S.PROVIDERS, {k: blocked for k in S.PROVIDERS}):
                with self.assertRaises(Exception) as cm:
                    F.fetch(paths, P, providers=list(S.PROVIDERS))
            self.assertIn("ENGELLİ", str(cm.exception))
            rep = (paths["root"] / "06_PROJECT_FILES" / "kaynak_raporu.md").read_text()
            self.assertIn("| tiktok | ENGELLİ |", rep)


if __name__ == "__main__":
    unittest.main()
