#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "index.html"
OUT_PATH = ROOT / "standalone.html"


def inline_scripts(html: str) -> str:
    pattern = re.compile(r'<script\s+src="([^"]+)"></script>')

    def repl(match: re.Match[str]) -> str:
        src = match.group(1)
        src_path = (ROOT / src).resolve()
        if not src_path.exists():
            raise FileNotFoundError(f"Script not found: {src}")
        content = src_path.read_text(encoding="utf-8")
        # Avoid ending the inline block early if a vendor file contains </script>.
        content = content.replace("</script>", "<\\/script>")
        return f"<script>\n{content}\n</script>"

    return pattern.sub(repl, html)


def main() -> None:
    html = INDEX_PATH.read_text(encoding="utf-8")
    inlined = inline_scripts(html)
    OUT_PATH.write_text(inlined, encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
