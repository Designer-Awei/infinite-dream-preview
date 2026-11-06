"""Check CRLF builds, published bytes, and optionally committed/online updates."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
GIT = shutil.which("git.exe") or "git"
if Path("C:/Program Files/Git/cmd/git.exe").exists():
    GIT = "C:/Program Files/Git/cmd/git.exe"


def verify(manifest, read):
    def check(item):
        name, expected = item
        data = read(name)
        actual = {"h": hashlib.sha1(data).hexdigest()[:12], "s": len(data)}
        assert actual == expected, f"{name}: expected {expected}, got {actual}"
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(check, manifest["files"].items()))
    print(f"PASS {manifest['version']}: {len(manifest['files'])} file sizes and hashes")


parser = argparse.ArgumentParser()
parser.add_argument("--git-ref", help="verify repository blobs, e.g. HEAD or : for the index")
parser.add_argument("--url", help="verify every deployed file against its remote manifest")
args = parser.parse_args()

cache = ROOT.parent / ".cache"
cache.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix="update-integrity-", dir=cache) as work:
    fixture = Path(work)
    text = {"index.html": b"<html>\r\n</html>\r\n", "manifest.webmanifest": b"{\r\n}\r\n",
            "style.css": b"body {\r\n}\r\n", "game.js": b"// test\r\n", "meta.json": b"{}\r\n",
            "NOTICE.md": b"license\r\n", "OFL.txt": b"font\r\n", "icon.svg": b"<svg/>\r\n"}
    binary = b"\x89PNG\r\n\x00\xff\r\n"
    for name, data in {**text, "icon.png": binary}.items():
        (fixture / name).write_bytes(data)
    subprocess.run([sys.executable, str(ROOT / "tools/manifest.py"), work], check=True)
    for name, data in text.items():
        assert (fixture / name).read_bytes() == data.replace(b"\r\n", b"\n")
    assert (fixture / "icon.png").read_bytes() == binary
    verify(json.loads((fixture / "update.json").read_bytes()), lambda name: (fixture / name).read_bytes())
    print("PASS Windows CRLF input becomes LF before hashing; binary bytes unchanged")

for folder in ("dist", "docs"):
    root = ROOT / folder
    verify(json.loads((root / "update.json").read_bytes()), lambda name: (root / name).read_bytes())

if args.git_ref:
    def blob(name):
        ref = ":" if args.git_ref == ":" else args.git_ref + ":"
        return subprocess.check_output([GIT, "show", ref + "docs/" + name], cwd=ROOT)
    verify(json.loads(blob("update.json")), blob)
    print("PASS repository bytes match manifest")

if args.url:
    base = args.url.rstrip("/") + "/"
    def remote(name):
        with urllib.request.urlopen(base + name, timeout=40) as response:
            return response.read()
    verify(json.loads(remote("update.json")), remote)
    print("PASS all deployed files match manifest")
