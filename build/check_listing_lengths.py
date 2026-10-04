"""校验 store/LISTING.md 里第 5 节的填表文案有没有超过商店的 1000 字符上限。

用法：python build/check_listing_lengths.py
"""

import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LISTING = os.path.join(ROOT, "store", "LISTING.md")
LIMIT = 1000


def main():
    with open(LISTING, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 只检查第 5 节
    start = next((i for i, l in enumerate(lines) if l.startswith("## 5.")), None)
    if start is None:
        sys.exit("[错误] 找不到第 5 节")
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## 6.")), len(lines))

    heading = "(未命名)"
    block = []
    in_block = False
    results = []

    for line in lines[start:end]:
        raw = line.rstrip("\n")
        if raw.startswith("### "):
            heading = raw[4:].strip()
        if raw.strip().startswith("```"):
            if in_block:
                results.append((heading, "\n".join(block)))
                block = []
                in_block = False
            else:
                in_block = True
            continue
        if in_block:
            block.append(raw)

    print(f"检查 {os.path.relpath(LISTING, ROOT)} 第 5 节，上限 {LIMIT} 字符/框\n")
    worst = 0
    over = 0
    for name, text in results:
        n = len(text)
        worst = max(worst, n)
        mark = "✗ 超限" if n > LIMIT else "✓"
        if n > LIMIT:
            over += 1
        bar = "#" * min(40, round(n / LIMIT * 40))
        print(f"  {mark}  {n:>4}/{LIMIT}  {bar:<40}  {name}")

    print(f"\n共 {len(results)} 个输入框，最长 {worst} 字符，超限 {over} 个")

    # 顺带检查 manifest 描述长度
    import json

    with open(os.path.join(ROOT, "steam-insight", "manifest.json"), encoding="utf-8") as f:
        m = json.load(f)
    print(f"\nmanifest 名称 {len(m['name'])}/45，描述 {len(m['description'])}/132")

    if over:
        sys.exit(1)


if __name__ == "__main__":
    main()
