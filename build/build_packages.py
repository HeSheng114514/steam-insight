"""打包商店提交用的 ZIP，并做结构自检。

Chrome Web Store 与 Edge Add-ons 都要求：
  · ZIP 内 **根目录** 直接就是 manifest.json（不能再套一层文件夹）
  · 路径分隔符必须是正斜杠
  · 不能包含开发/测试用的多余文件

用法：python build/build_packages.py
"""

import json
import os
import sys
import zipfile

# 中文 Windows 控制台默认 GBK，会把中文和符号打成乱码甚至抛 UnicodeEncodeError
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "steam-insight")
DIST = os.path.join(ROOT, "dist")

TOP_FILES = ["manifest.json"]
TOP_DIRS = ["src", "icons"]

# 不允许出现在包里的东西（开发期产物）
FORBIDDEN_PATTERNS = (".DS_Store", "__MACOSX", ".map", ".md", "fixtures", "selftest")


def load_manifest():
    path = os.path.join(SRC, "manifest.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def collect_files():
    files = []
    for name in TOP_FILES:
        if not os.path.isfile(os.path.join(SRC, name)):
            sys.exit(f"[错误] 缺少 {name}")
        files.append(name)
    for d in TOP_DIRS:
        base = os.path.join(SRC, d)
        if not os.path.isdir(base):
            sys.exit(f"[错误] 缺少目录 {d}")
        for dirpath, _, filenames in os.walk(base):
            for fn in filenames:
                rel = os.path.relpath(os.path.join(dirpath, fn), SRC).replace(os.sep, "/")
                files.append(rel)
    return sorted(files)


def build(zip_path, manifest):
    files = collect_files()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files:
            full = os.path.join(SRC, rel)
            with open(full, "rb") as f:
                data = f.read()
            # 固定时间戳与属性，保证同样输入产出同样的字节（可复现）
            info = zipfile.ZipInfo(rel, date_time=(2024, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data)
    return files


def verify(zip_path, manifest):
    problems = []
    refs = [
        manifest["background"]["service_worker"],
        manifest["options_page"],
        manifest["action"]["default_popup"],
    ]
    refs += manifest["content_scripts"][0]["js"]
    refs += manifest["content_scripts"][0]["css"]
    refs += list(manifest.get("icons", {}).values())
    refs += list(manifest["action"].get("default_icon", {}).values())

    with zipfile.ZipFile(zip_path) as z:
        names = z.namelist()
        if "manifest.json" not in names:
            problems.append("manifest.json 不在 ZIP 根目录（商店会直接拒收）")

        for n in names:
            if "\\" in n:
                problems.append(f"条目使用了反斜杠: {n}")
            if n.startswith("/") or ":" in n:
                problems.append(f"条目是绝对路径: {n}")
            low = n.lower()
            for bad in FORBIDDEN_PATTERNS:
                if bad.lower() in low:
                    problems.append(f"包含不该打包的文件: {n}")

        for r in sorted(set(refs)):
            if r not in names:
                problems.append(f"manifest 引用了包内不存在的文件: {r}")

        inner = json.loads(z.read("manifest.json").decode("utf-8"))
        if inner != manifest:
            problems.append("ZIP 内 manifest.json 与源文件不一致")
        if inner.get("manifest_version") != 3:
            problems.append("不是 Manifest V3")
        for perm in inner.get("permissions", []):
            if perm not in ("storage", "unlimitedStorage", "alarms"):
                problems.append(f"出现了意料之外的权限: {perm}")

        uncompressed = sum(i.file_size for i in z.infolist())

    return problems, len(names), uncompressed


def main():
    os.makedirs(DIST, exist_ok=True)
    manifest = load_manifest()
    version = manifest["version"]

    targets = [
        os.path.join(DIST, f"steam-insight-{version}-chrome.zip"),
        os.path.join(DIST, f"steam-insight-{version}-edge.zip"),
    ]

    print(f"扩展版本：{version}   名称：{manifest['name']}\n")
    failed = False
    for path in targets:
        files = build(path, manifest)
        problems, count, uncompressed = verify(path, manifest)
        size = os.path.getsize(path)
        print(f"── {os.path.relpath(path, ROOT)}")
        print(f"   文件数 {count}   压缩后 {size:,} 字节   解压后 {uncompressed:,} 字节")
        for rel in files:
            print(f"     · {rel}")
        if problems:
            failed = True
            print("   [自检失败]")
            for p in problems:
                print(f"     ✗ {p}")
        else:
            print("   ✓ 自检通过：manifest 在根目录、引用文件齐全、无开发残留")
        print()

    if failed:
        sys.exit(1)
    print("两个商店用同一份内容，只是文件名不同（Edge 后台也接受同一个 ZIP）。")


if __name__ == "__main__":
    main()
