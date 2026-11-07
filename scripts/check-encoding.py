"""上传前自查：所有被 Git 跟踪的文本文件必须是合法 UTF-8、不带 BOM。
Windows 上很容易混进 GBK 编码的文件，推到 GitHub 后中文会变成乱码 —— 这是「可复现」最廉价也最尴尬的翻车点。

两个必须防住的「静默漏检」（2026-11-07 加固）：
1. **空格拆词**：`git ls-files` 输出用 `.split()` 会按空白拆，文件名带空格时
   会被拆成两段 → open() 失败 → 被 except 静默跳过。
2. **quotepath 转义**：git 默认把非 ASCII 路径转义成 "\\346\\225..."，open() 必然失败 → 同样静默跳过。
统一用 `-c core.quotepath=false` + `-z`（NUL 分隔）取路径，两种都不会再错。
"""
import subprocess
import sys

# Windows 默认控制台是 GBK，中文输出会变乱码甚至抛 UnicodeEncodeError；
# 统一按 UTF-8 输出（CI 的 Ubuntu 本来就是 UTF-8），并允许坏字符替换。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

BOM = b"\xef\xbb\xbf"


def tracked_files():
    """取被跟踪的文件列表。失败必须非零退出，不能把「读不到」当成「没问题」。"""
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "ls-files", "-z"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if out.returncode != 0:
        print(f"FAIL: git ls-files 失败（exit {out.returncode}）：{(out.stderr or '').strip()[:200]}")
        sys.exit(2)
    # -z 用 NUL 分隔：文件名带空格、带中文都不会被拆错
    return [name for name in out.stdout.split("\0") if name]


files = tracked_files()

bad, bom, binary, unreadable = [], [], [], []
for name in files:
    try:
        with open(name, "rb") as handle:
            raw = handle.read()
    except OSError as exc:
        # 读不到就记下来 —— 静默跳过会让这道门变成假门
        unreadable.append((name, str(exc)[:60]))
        continue
    if b"\x00" in raw:
        binary.append(name)
        continue
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        bad.append((name, str(exc)[:70]))
    if raw.startswith(BOM):
        bom.append(name)

print(f"checked: {len(files)}")
print("NON-UTF8:", bad if bad else "none")
print("BOM:", bom if bom else "none")
print("binary:", binary if binary else "none")
print("unreadable:", unreadable if unreadable else "none")

readme = "README.md"
if readme in files:
    try:
        text = open(readme, encoding="utf-8").read()
        print("README 首行:", text.splitlines()[0])
        print("中文可解:", "拾穗" in text, "| 行数:", len(text.splitlines()))
    except (OSError, UnicodeDecodeError):
        print("README 读取失败")

# 发现问题必须非零退出，否则 CI 里的「编码自查」是一道假门
if bad or bom or unreadable:
    print("FAIL: 存在非 UTF-8 文件、BOM，或读不出来的文件，请修正后再提交")
    sys.exit(1)
sys.exit(0)
