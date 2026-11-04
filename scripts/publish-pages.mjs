#!/usr/bin/env node
/**
 * 把 dist/ 发布到 gh-pages 分支（GitHub Pages 的「从分支部署」模式）。
 *
 * 为什么要这个脚本：本仓库的 Pages 采用分支发布，不走 GitHub Actions ——
 * 新账号的 Actions 队列会被风控长时间排队，而静态站点完全可以由 GitHub 服务端直接发布。
 *
 * 用法：pnpm deploy   （= pnpm build && node scripts/publish-pages.mjs）
 *
 * 行为：
 *  1. 在系统临时目录里建一个独立仓库，把 dist 拷进去并加 .nojekyll；
 *  2. 提交后强制推到 origin 的 gh-pages 分支；
 *  3. 不改动 main 的历史，gh-pages 是每次覆盖的产物分支。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'inherit', encoding: 'utf8' })

const root = process.cwd()

if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('✗ 找不到 dist/index.html，先跑 pnpm build')
  process.exit(1)
}

const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim()
if (!remote) {
  console.error('✗ 没有配置 origin 远端')
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'kedaibiao-pages-'))
console.log('→ 临时目录:', work)

try {
  cpSync(join(root, 'dist'), work, { recursive: true })
  // .nojekyll：让 GitHub Pages 跳过 Jekyll 处理，避免下划线开头的资源被忽略
  writeFileSync(join(work, '.nojekyll'), '')

  git(['init', '-b', 'gh-pages'], work)
  git(['add', '-A'], work)
  git(['commit', '-m', `deploy: ${new Date().toISOString()}`], work)
  git(['remote', 'add', 'origin', remote], work)
  git(['push', '--force', 'origin', 'gh-pages'], work)

  console.log('✓ 已发布到 gh-pages')
  const repoPath = remote.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')
  console.log('  站点地址: https://' + repoPath.split('/')[0] + '.github.io/' + repoPath.split('/')[1] + '/')
} finally {
  rmSync(work, { recursive: true, force: true })
}
