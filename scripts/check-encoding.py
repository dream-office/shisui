"""上传前自查：所有被 Git 跟踪的文本文件必须是合法 UTF-8。
Windows 上很容易混进 GBK 编码的文件，推到 GitHub 后中文会变成乱码 —— 这是「可复现」最廉价也最尴尬的翻车点。
"""
import subprocess

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
print("中文可解:", "课代表" in text, "| 行数:", len(text.splitlines()))
