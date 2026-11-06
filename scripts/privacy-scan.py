#!/usr/bin/env python3
"""发布前隐私自查：确认公开仓库里没有个人数据。

检查三类：
1) 受版本控制的文件内容里有没有邮箱、手机号、身份证号、学号、绝对路径；
2) git 历史里的作者姓名 / 邮箱（提交元数据同样是公开发布面）；
3) 仓库根目录有没有混进不该公开的备份、导出、密钥文件。

用法：
    python scripts/privacy-scan.py                    # 扫当前目录
    python scripts/privacy-scan.py --path D:\\proj    # 扫指定仓库
    python scripts/privacy-scan.py --quiet            # 只在有问题时输出

本地白名单：仓库根目录的 `.privacy-allow`（已在 .gitignore，不会发布）里每行一个正则，
命中即视为「有意公开」，用于放行自己确认过可以公开的邮箱 / 域名。
退出码：0 干净 / 1 有发现（便于接进 CI 或发布脚本）/ 2 环境错误（路径不对、不是 git 仓库、git 命令失败）

注意：git 默认会把非 ASCII 路径转义成 "\\346\\225..."，这里统一加
`-c core.quotepath=false`，否则中文路径的文件会被静默跳过 —— 那种「0 命中」是假的。
"""
import argparse
import os
import re
import subprocess
import sys

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

ROOT = "."


def load_local_allow():
    """本地白名单：把自己确认可公开的信息写进 .privacy-allow，不硬编码进公开脚本。"""
    global ALLOW
    path = os.path.join(ROOT, ".privacy-allow")
    if not os.path.exists(path):
        return
    extra = [
        line.strip()
        for line in open(path, encoding="utf-8").read().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    if extra:
        ALLOW = re.compile(ALLOW.pattern + "|" + "|".join(extra))


def git(*args):
    return subprocess.run(
        ["git", "-c", "core.quotepath=false", *args],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def git_or_die(*args):
    """git 失败时直接退出 2 —— 不能把「读不到」当成「没有发现」。"""
    out = git(*args)
    if out.returncode != 0:
        print(f"[!] git {' '.join(args)} 失败（exit {out.returncode}）：{(out.stderr or '').strip()[:300]}")
        sys.exit(2)
    return out


def tracked_files():
    out = git_or_die("ls-files")
    return [f for f in out.stdout.splitlines() if f.strip()]


def scan_worktree():
    findings = []
    for path in tracked_files():
        if path.endswith(SKIP_EXT) or path in SKIP_PATH:
            continue
        try:
            text = open(os.path.join(ROOT, path), encoding="utf-8").read()
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
    out = git_or_die("log", "--format=%h%x09%an%x09%ae", "--all")
    emails = {}
    for line in out.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        sha, name, email = parts
        if not ALLOW.search(email):
            emails.setdefault(email, []).append(sha)
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
    global ROOT
    # Windows 默认控制台是 GBK，表情符号会直接抛 UnicodeEncodeError；
    # 先在入口处把 stdout 兜住，输出里也只用 ASCII 标记。
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    ap = argparse.ArgumentParser(description="发布前隐私自查")
    ap.add_argument("--path", default=".", help="仓库目录或仓库内任意子目录（会自动解析到仓库根）")
    ap.add_argument("--quiet", action="store_true", help="只在有问题时输出")
    args = ap.parse_args()

    base = os.path.abspath(args.path)
    if not os.path.isdir(base):
        print(f"[!] 目录不存在：{base}")
        return 2
    # 用 git 自己解析仓库根：从子目录调用也能工作；不是仓库就直接失败，
    # 绝不把「读不到」当成「没发现」。
    probe = subprocess.run(
        ["git", "-C", base, "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if probe.returncode != 0:
        print(f"[!] 不是 git 仓库或无法读取：{base}")
        return 2
    ROOT = probe.stdout.strip()

    load_local_allow()
    findings = scan_worktree() + scan_history() + scan_stray_files()
    if not findings:
        if not args.quiet:
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
