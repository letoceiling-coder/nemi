"""Helpers for scripts/release.ps1.
  bump <version>                                  -> set the version in every manifest
  manifest <version> <sig file> <url> <out.json>  -> write the Tauri updater manifest (latest.json)
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DESKTOP = ROOT / "apps" / "desktop"


def _sub(path: Path, pattern: str, repl: str, count: int = 1) -> None:
    s = path.read_text(encoding="utf-8")
    new, n = re.subn(pattern, repl, s, count=count, flags=re.M)
    if n != count:
        raise SystemExit(f"{path}: version pattern not found")
    path.write_text(new, encoding="utf-8", newline="\n")


def bump(v: str) -> None:
    conf = DESKTOP / "src-tauri" / "tauri.conf.json"
    c = json.loads(conf.read_text(encoding="utf-8"))
    c["version"] = v
    conf.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    _sub(DESKTOP / "src-tauri" / "Cargo.toml", r'^version = "[^"]+"', f'version = "{v}"')
    _sub(DESKTOP / "package.json", r'^  "version": "[^"]+"', f'  "version": "{v}"')
    _sub(ROOT / "services" / "api" / "app" / "main.py", r'version="\d+\.\d+\.\d+"', f'version="{v}"')
    notes(v)  # fail early if the changelog has no section for this version
    print(f"version -> {v}")


def notes(v: str) -> str:
    text = (ROOT / "docs" / "CHANGELOG.md").read_text(encoding="utf-8")
    m = re.search(rf"^## {re.escape(v)}\b[^\n]*\n(.*?)(?=^## |\Z)", text, flags=re.M | re.S)
    if not m or not m.group(1).strip():
        raise SystemExit(f"docs/CHANGELOG.md: add a '## {v}' section with release notes first")
    return m.group(1).strip()


def manifest(v: str, sig: str, url: str, out: str) -> None:
    data = {
        "version": v,
        "notes": notes(v),
        "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platforms": {"windows-x86_64": {"signature": Path(sig).read_text(encoding="utf-8").strip(), "url": url}},
    }
    Path(out).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest -> {out}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    {"bump": bump, "manifest": manifest}[cmd](*args)
