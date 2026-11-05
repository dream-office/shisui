"""上传前自查：所有被 Git 跟踪的文本文件必须是合法 UTF-8。
Windows 上很容易混进 GBK 编码的文件，推到 GitHub 后中文会变成乱码 —— 这是「可复现」最廉价也最尴尬的翻车点。
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

files = subprocess.run(
    ["git", "ls-files"], capture_output=True, text=True, encoding="utf-8"
).stdout.split()

bad, bom, binary = [], [], []
for name in files:
    try:
        raw = open(name, "rb").read()
    except OSError:
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

text = open("README.md", encoding="utf-8").read()
print("README 首行:", text.splitlines()[0])
print("中文可解:", "拾穗" in text, "| 行数:", len(text.splitlines()))

# 发现问题必须非零退出，否则 CI 里的「编码自查」是一道假门
if bad or bom:
    print("FAIL: 存在非 UTF-8 文件或 BOM，请修正后再提交")
    sys.exit(1)
sys.exit(0)
