#!/usr/bin/env python3
"""发布前隐私自查：确认公开仓库里没有个人数据。

检查三类：
1) 受版本控制的文件内容里有没有邮箱、手机号、身份证号、学号、绝对路径；
2) git 历史里的作者姓名 / 邮箱（提交元数据同样是公开发布面）；
3) 仓库根目录有没有混进不该公开的备份、导出、密钥文件。

用法：
    python scripts/privacy-scan.py            # 扫工作树 + 历史
    python scripts/privacy-scan.py --quiet    # 只在有问题时输出
退出码：0 干净 / 1 有发现（便于接进 CI 或发布脚本）
"""
import re
import subprocess
import sys

QUIET = "--quiet" in sys.argv

# 一眼假的占位符，命中这些不算问题
ALLOW = re.compile(
    r"example\.com|example\.org|teacher@edu\.cn|users\.noreply\.github\.com|4294967296"
)

CHECKS = [
    ("私人邮箱", re.compile(r"[\w.+-]+@(?!example\.|users\.noreply\.)[\w-]+\.[A-Za-z]{2,}")),
    ("手机号", re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")),
    ("身份证号", re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")),
    ("疑似学号", re.compile(r"(?<!\d)5\d{11}(?!\d)")),
    ("本机绝对路径", re.compile(r"[A-Za-z]:\\{1,2}(?:DeepSeek|Users|dsh)\b")),
]

SKIP_EXT = (".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".bundle")
SKIP_PATH = ("pnpm-lock.yaml", "package-lock.json")


def tracked_files():
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, encoding="utf-8")
    return [f for f in out.stdout.splitlines() if f.strip()]


def scan_worktree():
    findings = []
    for path in tracked_files():
        if path.endswith(SKIP_EXT) or path in SKIP_PATH:
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError):
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if ALLOW.search(line):
                line = ALLOW.sub("<占位>", line)
            for name, pattern in CHECKS:
                m = pattern.search(line)
                if m:
                    findings.append((name, path, lineno, m.group(0)[:60]))
    return findings


def scan_history():
    out = subprocess.run(
        ["git", "log", "--format=%h%x09%an%x09%ae", "--all"],
        capture_output=True, text=True, encoding="utf-8",
    )
    emails, names = {}, {}
    for line in out.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        sha, name, email = parts
        if not ALLOW.search(email):
            emails.setdefault(email, []).append(sha)
        names.setdefault(name, []).append(sha)
    findings = []
    for email, shas in emails.items():
        findings.append(("历史里的私人邮箱", f"git 历史 {len(shas)} 个提交", 0, email))
    return findings


def scan_stray_files():
    """仓库根目录不该出现的文件：备份包、导出、密钥、本地库"""
    bad = re.compile(r"\.(bundle|bak|backup|zip|7z|tar|gz|env|pem|key)$|^\.env|backup|导出", re.I)
    findings = []
    for path in tracked_files():
        if bad.search(path):
            findings.append(("不该公开的文件", path, 0, path))
    return findings


def main():
    # Windows 默认控制台是 GBK，表情符号会直接抛 UnicodeEncodeError；
    # 先在入口处把 stdout 兜住，输出里也只用 ASCII 标记。
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    findings = scan_worktree() + scan_history() + scan_stray_files()
    if not findings:
        if not QUIET:
            print("[OK] 隐私自查通过：工作树与 git 历史里没有发现个人数据")
        return 0

    print(f"[!] 发现 {len(findings)} 处需要处理：")
    for name, where, lineno, sample in findings:
        loc = f"{where}:{lineno}" if lineno else where
        print(f"  [{name}] {loc} -> {sample}")
    print("\n处理原则：换成一眼假的占位；历史里的私人邮箱需要改写作者（破坏性操作，先确认）。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
