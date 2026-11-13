/**
 * 轻量 i18n（自建，不引第三方库）：
 * - key 直接用中文原文；en 字典做映射，缺 key 时回退中文（不崩）
 * - 模板参数用 `{name}` 占位
 * - `setLang` 只改模块变量，由 App 订阅 store.lang 触发重渲染
 * - 日期/相对时间统一走 Intl，不手拼「星期」
 */
export type Lang = 'zh' | 'en'

const EN: Record<string, string> = {
  // 应用外壳
  拾穗: 'Shisui',
  '群里散落的截止时间，替你捡起来': 'Pick up the deadlines scattered in your group chats',
  收件: 'Inbox',
  日程: 'Plan',
  月历: 'Calendar',
  统计: 'Stats',
  设置: 'Settings',
  主视图: 'Main views',
  怎么用: 'How to use',
  双引擎: 'Hybrid',
  规则引擎: 'Rule engine',
  '规则引擎 + AI 双引擎': 'Rule engine + AI',
  '仅规则引擎（在设置里可接入 AI）': 'Rule engine only (connect AI in Settings)',
  '数据只存在本地浏览器里（IndexedDB），不上传服务器': 'Data stays in your local browser (IndexedDB); nothing is uploaded',
  '规则引擎离线可用，接不接 AI 都能跑': 'The rule engine works offline, with or without AI',
  '源码（AGPL-3.0）': 'Source (AGPL-3.0)',
  有新版本可用: 'A new version is available',
  刷新: 'Refresh',
  当前环境不支持: 'Not supported in this environment',
  关闭: 'Close',

  // 使用说明
  怎么用拾穗: 'How to use Shisui',
  '粘贴群消息': 'Paste the group message',
  '把群里的通知整段复制到收件页输入框（iOS 可点「粘贴分享内容」），点「开始解析」。':
    'Copy the whole notice into the Inbox input (on iOS tap “Paste shared content”), then hit “Parse”.',
  '检查解析结果并收录': 'Review the parsed results and accept',
  '规则引擎会拆出事项与截止时间；有歧义或低置信度的会标出来，确认后点「全部收录」。':
    'The rule engine splits out items and deadlines; ambiguous or low-confidence ones are flagged. Confirm, then tap “Accept all”.',
  '去日程 / 月历': 'Go to Plan / Calendar',
  '日程按天排好并做冲突提醒，月历可拖拽改期；完成、重复、统计都在对应页面。':
    'Plan groups tasks by day and flags conflicts; drag tasks in Calendar to reschedule. Completion, recurrence and stats live on their pages.',
  补充说明: 'Notes',
  '数据只存在你自己的浏览器（IndexedDB）里，不上传服务器；唯一会出网的是你自己配置 AI 接口时。':
    'Data stays in your own browser (IndexedDB) and is never uploaded. The only network call happens when you configure an AI endpoint.',
  '重复任务：完成一次会自动生成下一次；「跳过这一次」不算完成；「结束重复」停止生成但保留历史。':
    'Recurring tasks: completing one generates the next occurrence. “Skip this time” is not a completion, and “End series” stops generating while keeping history.',
  'iOS 没有系统分享目标：复制微信群消息后，用收件页的「粘贴分享内容」按钮即可。':
    'iOS has no system share target: copy the WeChat message, then use the “Paste shared content” button on the Inbox page.',
  知道了: 'Got it',
  关闭使用说明: 'Close help',

  // 首次提示
  '第一次用？三步就能把群消息变成待办：粘贴 → 检查 → 收录。':
    'First time? Turn a group message into to-dos in three steps: paste → review → accept.',

  // 收件页
  '把群里的消息': 'Paste the message from your group ',
  '粘进来': 'here',
  '，剩下的它替你记着': ', and you never miss a deadline',
  '「本周五23:59前交实验报告」「下周三下午2点3楼会议室」「11月20日前提交报销单」——':
    '“Lab report due before Friday 23:59”, “next Wednesday 2pm, 3F meeting room”, “submit the expense report by Nov 20” —',
  '项目群、部门群、班级群、家长群，说的是同一件事：': 'Project, department, class or parent groups all say the same thing:',
  '有个截止时间，别错过': 'there is a deadline, do not miss it',
  '来自分享：内容已填入下面的输入框，点「开始解析」就能变成待办。':
    'Shared content has been filled in below. Tap “Parse” to turn it into to-dos.',
  群消息原文: 'Original message',
  '例如：\n【项目群】张经理：\n1. 本周五18:00前把预算表发到财务邮箱。\n2. 下周一上午10点在 3楼会议室 开复盘会。\n\n或者学校通知：\n本周五23:59前在学习通提交实验报告三。':
    'e.g.\n[Project group] Manager Zhang:\n1. Send the budget sheet to finance before Friday 18:00.\n2. Retrospective meeting next Monday 10am in room 3F.\n\nOr a school notice:\nSubmit lab report 3 on the learning platform before Friday 23:59.',
  开始解析: 'Parse',
  '解析中…': 'Parsing…',
  粘贴分享内容: 'Paste shared content',
  工作群示例: 'Work example',
  学校通知示例: 'School example',
  清空: 'Clear',
  '手动添加': 'Add manually',
  '还没有解析结果': 'No results yet',
  '识别到': 'Found',
  '条待办': 'to-dos',
  '全部收录': 'Accept all',
  '低置信度/有歧义，收录前请核对': 'Low confidence / ambiguous — please review before accepting',
  '共': 'Total',
  '条': 'items',
  '已收录': 'Accepted',
  '本次解析没有可用的待办，换个说法再试': 'No usable to-dos found — try rephrasing',
  '解析失败': 'Parsing failed',
  解析失败请重试: 'Parsing failed, please retry',
  'AI 调用失败，已回退规则引擎': 'AI call failed, fell back to the rule engine',
  '文本太短，再粘点内容': 'Text is too short — paste more',
  '粘贴失败': 'Paste failed',
  '剪贴板里没有文字，先复制群消息再点一次': 'Clipboard is empty — copy the message first and try again',
  '浏览器不允许读取剪贴板，请长按输入框手动粘贴': 'Clipboard access is blocked — long-press the input to paste manually',
  确认: 'Confirm',
  取消: 'Cancel',
  收起: 'Collapse',

  // 候选卡片
  时间: 'Time',
  类型: 'Type',
  渠道: 'Channel',
  地点: 'Location',
  已手改: 'Edited',
  处: 'places',
  高置信度: 'High confidence',
  中置信度: 'Medium confidence',
  低置信度: 'Low confidence',
  'AI': 'AI',
  '混合': 'Hybrid',
  丢弃: 'Dismiss',
  '任务': 'Task',
  '会议': 'Meeting',
  '评审': 'Review',
  '报名': 'Sign-up',
  '缴费': 'Payment',
  '审批': 'Approval',
  '问卷': 'Survey',
  '考试': 'Exam',
  '其他': 'Other',

  // 批量预览
  批量预览: 'Batch preview',
  '多段粘贴会按时间戳/分隔线/空行切分，逐段解析。': 'Multi-section pastes are split by timestamp, divider or blank line and parsed one by one.',
  '全选': 'Select all',
  '全不选': 'Clear',
  '收录选中': 'Accept selected',
  '已选': 'Selected',
  '重复内容已自动合并': 'Duplicates merged automatically',
  '段': 'section',
  '没有可收录的待办': 'Nothing to accept',

  // 日程
  '日程还是空的': 'Your plan is empty',
  '去「收件」贴一段群通知，解析完收录进来，这里就会自动排好并做冲突体检。':
    'Paste a notice in Inbox, accept the results, and they will be scheduled here with a conflict check.',
  去贴通知: 'Paste a notice',
  '导出 .ics': 'Export .ics',
  '导出后可在系统日历 / Google Calendar 里导入或订阅':
    'Import or subscribe in your system calendar / Google Calendar after export',
  '搜索标题 / 原文 / 地点 / #标签': 'Search title / text / location / #tag',
  搜索任务: 'Search tasks',
  专注模式: 'Focus mode',
  多选: 'Select',
  退出多选: 'Exit selection',
  全选当前: 'Select all',
  批量完成: 'Complete selected',
  取消完成: 'Mark incomplete',
  批量删除: 'Delete selected',
  只看未完成: 'Open only',
  撤销: 'Undo',
  '撤销「': 'Undo “',
  '」': '”',
  待办: 'Open',
  件没做完: 'tasks left',
  '冲突/风险': 'Conflicts / risks',
  处需要留意: 'to watch',
  冲突体检: 'Conflict check',
  '没有明确时间 · 建议手动补一个': 'No clear time — add one manually',
  已完成: 'Completed',
  件: 'items',
  没有时间信息的任务: 'Tasks without time',
  '已跳过': 'Skipped',
  '跨天': 'Multi-day',
  '编辑任务': 'Edit task',
  '标记为已完成': 'Mark as done',
  '标记为未完成': 'Mark as not done',
  '跳过这一次': 'Skip this time',
  '结束重复': 'End series',
  删除: 'Delete',
  '＋标签': '+ Tag',
  新标签: 'New tag',
  输入标签后回车: 'Type a tag and press Enter',
  加: 'Add',
  完成: 'Done',
  '剩': '',
  '已过期': 'Overdue',
  '天后': 'days left',
  '小时后': 'hours left',
  '分钟后': 'minutes left',
  '天后截止': 'due in {n} days',
  '小时后截止': 'due in {n} hours',
  '分钟后截止': 'due in {n} minutes',
  '已过期 {n} 天': 'overdue by {n} days',
  '已过期 {n} 小时': 'overdue by {n} hours',
  '已过期 {n} 分钟': 'overdue by {n} minutes',
  '今天': 'Today',
  '明天': 'Tomorrow',
  '后天': 'In 2 days',
  '昨天': 'Yesterday',
  '前天': '2 days ago',

  // 月历
  '上个月': 'Previous month',
  '下个月': 'Next month',
  '今天按钮': 'Today',
  '这天没有事。把其他日子的任务拖到这一格就能挪过来。':
    'Nothing on this day. Drag tasks from other days here to move them.',
  '拖动任务到别的日期可改期；时刻保持不变，全天任务仍是整天。':
    'Drag a task to another day to reschedule; the time of day stays, all-day tasks stay all-day.',
  '月': 'month',
  '日': 'day',
  '，': ', ',
  '件事': 'items',

  // 统计
  '全部在本地计算': 'Calculated entirely on-device',
  '本周完成率': 'Completion this week',
  '解析手改率': 'Manual correction rate',
  '全部任务': 'All tasks',
  '未完成': 'Open',
  '包括所有来源与已完成': 'Includes all sources and completed tasks',
  '还在日程里的条目': 'Still in your plan',
  '本周到期': 'Due this week',
  '解析来源': 'Parsed from',
  '，其中你手动改过': ', of which you edited',
  '（按到期时间统计，不看完成时间）': ' (counted by due time, not completion time)',
  '（手动添加 / 日历导入不算）': ' (manual additions / calendar imports excluded)',

  // 设置
  备份与恢复: 'Backup & restore',
  '备份是一个 JSON 文件，包含全部任务、重复系列和历史记录。': 'A backup is a JSON file containing all tasks, recurring series and history.',
  '恢复会覆盖当前全部数据': 'Restoring replaces all current data',
  '先下载一份再恢复最稳。': 'Download one before restoring.',
  '文件不加密': 'The file is not encrypted',
  '（备份里没有 AI Key，但可能含通知原文），请自己保管好。': ' (no AI key inside, but it may contain original notices) — keep it safe.',
  导出JSON备份: 'Export JSON backup',
  导出_JSON_备份: 'Export JSON backup',
  '选择备份文件恢复': 'Choose a backup file',
  '加密备份（密码至少 8 位，丢失密码无法恢复）': 'Encrypt backup (password ≥ 8 chars; lost password is unrecoverable)',
  密码: 'Password',
  再输一次: 'Repeat password',
  '导出 JSON 备份': 'Export JSON backup',
  '这份备份导出时间': 'Exported at',
  '含': 'Contains',
  '条任务': 'tasks',
  '个重复系列': 'series',
  '条历史': 'history entries',
  '确认后会清空当前数据并替换，不可撤销。': 'This replaces all data and cannot be undone.',
  确认恢复: 'Restore now',
  已恢复: 'Restored',
  '这是加密备份，输入导出时设置的密码来解锁。': 'This is an encrypted backup. Enter the password used at export time.',
  解密并预览: 'Decrypt & preview',
  解密密码: 'Backup password',
  '备份密码': 'Backup password',
  确认备份密码: 'Confirm backup password',
  '已恢复 1 条任务': 'Restored 1 task',
  '已恢复 {n} 条任务': 'Restored {n} tasks',
  '备份已下载': 'Backup downloaded',
  '加密备份已下载（密码请自己记住，丢了无法恢复）': 'Encrypted backup downloaded (remember the password; it cannot be recovered)',
  '密码至少 8 位': 'Password must be at least 8 characters',
  '两次输入的密码不一致': 'Passwords do not match',
  '备份文件不完整（可能被截断），请重新导出后再恢复':
    'Backup file is incomplete (possibly truncated). Please export again.',
  '备份文件不完整': 'Backup file is incomplete',
  '不是合法的 JSON 文件': 'Not a valid JSON file',
  '加密备份不是合法的 JSON': 'Encrypted backup is not valid JSON',
  '不是拾穗备份': 'Not a Shisui backup',
  '不是拾穗加密备份': 'Not a Shisui encrypted backup',
  '备份内容不是对象': 'Backup content is not an object',
  '加密备份内容不是对象': 'Encrypted backup content is not an object',
  '缺少合法的 schemaVersion': 'Missing valid schemaVersion',
  '缺少 tasks 数组': 'Missing tasks array',
  '缺少 series 数组': 'Missing series array',
  '缺少 batches 数组': 'Missing batches array',
  '密码错误，或文件已损坏': 'Wrong password, or the file is corrupted',
  'AI 增强引擎（可选）': 'AI enhancement (optional)',
  接口地址: 'Endpoint',
  模型: 'Model',
  'API Key': 'API Key',
  保存: 'Save',
  已保存: 'Saved',
  关于拾穗: 'About Shisui',
  '默认不联网：数据只存在你自己的浏览器 IndexedDB 里；没有账号、没有服务器、不上传。':
    'Offline by default: data lives in your browser IndexedDB — no account, no server, no upload.',
  '唯一会出网的情况是你自己配置了 AI 接口并触发解析。':
    'The only network call happens when you configure an AI endpoint and trigger parsing.',
  '填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。':
    'Fill in any OpenAI-compatible endpoint to enable the hybrid engine. The rule engine works offline without it, with lower tolerance for unusual phrasing.',
  'Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。':
    'The key is stored only in your localStorage; requests go straight to the provider you configure.',
  '已配置：解析时会尝试 AI，失败自动降级': 'Configured: AI is tried during parsing and falls back on failure',
  '未配置：只用规则引擎': 'Not configured: rule engine only',
  语言: 'Language',
  中文: '中文',
  English: 'English',
  '界面语言': 'Interface language',

  // 专注
  '全部处理完了': 'All done',
  '没有未完成的任务了，休息一下。': 'No open tasks — take a break.',
  退出专注: 'Exit focus',
  下一条: 'Next',
  跳过: 'Skip',
  '完成后会自动排到下一条；「跳过」对重复任务是「跳过这一次」。':
    'After completing, the next task appears. “Skip” on a recurring task means “skip this time”.',
  '专注': 'Focus',

  // 错误边界
  '界面出了点问题': 'Something went wrong',
  重试: 'Retry',
  回首页: 'Go home',
  '你的数据还在本地，不会丢。可以点「重试」恢复界面，或者回首页重新开始。':
    'Your data is still stored locally and is safe. Tap “Retry” to recover the UI, or go home to start over.',

  // 通用
  关闭弹层: 'Close dialog',
  '只改这一次': 'This occurrence only',
  '改整个系列（当前 + 未来未完成）': 'Whole series (current + future open occurrences)',
  '改整个系列只改时刻，日期与重复规则保持不变；将同步 {n} 个未完成实例（已完成/已跳过历史不动）。':
    'For the whole series only the time of day changes; dates and recurrence stay. {n} open occurrences will be synced (completed/skipped history untouched).',
  '保持日期不变': 'Date stays unchanged',
  '时刻（日期不变）': 'Time (date unchanged)',
  '编辑时间（只改时刻）': 'Edit time (time only)',
  '编辑行高': 'Edit',
  '标题': 'Title',
  '标签（逗号分隔）': 'Tags (comma separated)',
  '标签': 'Tags',
  归档: 'Archive',
}


export function undoLabelI18n(label: string): string {
  if (currentLang !== 'en') return label
  const done = /批量完成 (\d+) 件/.exec(label)
  if (done) return `Completed ${done[1]} items`
  const undone = /批量取消完成 (\d+) 件/.exec(label)
  if (undone) return `Marked ${undone[1]} items incomplete`
  const deleted = /批量删除 (\d+) 件/.exec(label)
  if (deleted) return `Deleted ${deleted[1]} items`
  return label
}

Object.assign(EN, {
  外观: 'Appearance',
  跟随系统: 'System',
  亮色: 'Light',
  暗色: 'Dark',
  '默认跟随系统；也可以固定亮色或暗色。': 'Follow the system by default, or pin light/dark.',

  '8 周完成趋势': '8-week completion trend',
  '按每周到期任务统计，跳过不计': 'By due/start time each week; skipped excluded',
  '按任务类型分布': 'Task type distribution',
  '全部任务（含已完成/跳过）': 'All tasks (including done/skipped)',
  '每日专注趋势': 'Daily focus trend',
  '最近 7 天，切走/锁屏 30 秒内回来继续计时': 'Last 7 days; returns within 30s of tab switch/lock continue timing',
  '延期完成率': 'Late completion rate',
  '有完成时间的 {n} 件已完成中，{late} 件晚于截止时间':
    '{late} of {n} completed tasks with a recorded finish time were late',
  '未完成 / 全部': 'Open / total',
  '已跳过 {n} 件，不算完成率、逾期与冲突': '{n} skipped; excluded from completion, overdue and conflicts',
  '导出 CSV': 'Export CSV',
  '导出 PNG': 'Export PNG',
  '统计口径说明': 'How stats are calculated',
  '还没有任务': 'No tasks yet',
  '本周到期 {n} 件，已完成 {done} 件（按到期时间统计，跳过不计）':
    'Due this week: {n}; done: {done} (by due time, skipped excluded)',
  '本周完成率：分母是按开始/截止时间落在本周的任务，分子是其中已完成；跳过的任务不计入。':
    'Weekly completion: denominator = tasks starting/due this week; numerator = done among them; skipped excluded.',
  '延期完成率：只看有实际完成时间（doneAt）的已完成任务，完成时间晚于截止/开始时间算延期。':
    'Late completion: only completed tasks with an actual finish time (doneAt); finished later than due/start counts as late.',
  '8 周趋势：以周一为一周起点，按任务开始/截止时间归属，跳过不计。':
    '8-week trend: weeks start Monday; grouped by start/due time; skipped excluded.',
  '专注时长：只记本机完成的专注段，最近 7 个自然日；单段不足 1 分钟或超过 4 小时不记。':
    'Focus time: locally completed sessions in the last 7 calendar days; segments under 1 minute or over 4 hours are ignored.',
  '所有数据只在本机计算，不上传。': 'Everything is calculated locally and never uploaded.',
  '完成后会自动排到下一条；「跳过」对重复任务是「跳过这一次」。切走/锁屏 30 秒内回来会继续计时，超过 30 秒才结算这一段。':
    'Completing moves to the next task; “Skip” skips this recurrence. Returning within 30s of a tab switch/lock continues timing; only longer absences settle the segment.',
  '任务 / 交付物': 'Task / deliverable',
  '会议 / 活动': 'Meeting / event',
  '评审 / 验收': 'Review / acceptance',
  '报名 / 登记': 'Sign-up / registration',
  '缴费 / 报销': 'Payment / reimbursement',
  '审批 / 确认': 'Approval / confirmation',
  '问卷 / 填表': 'Survey / form',
  '考试 / 测验': 'Exam / quiz',
  其他: 'Other',
})
Object.assign(EN, {
  '更多 ▾': 'More ▾',
  更多操作: 'More actions',
  示例: 'Examples',

  第三方许可: 'Third-party licenses',

  '设备内存较低，建议改用 AI 识图（不强制）。':
    'This device has limited memory — AI vision may work better (not enforced).',

  导入文档: 'Import document',
  识别图片: 'Recognize image',
  'PDF / DOCX / TXT / MD · 图片 png/jpg/webp': 'PDF / DOCX / TXT / MD · images png/jpg/webp',
  图片识别: 'Image recognition',
  '文档在本机解析；图片可选择本地 OCR（不上传）或 AI 识图（发送到你配置的 API）。':
    'Documents are parsed on this device. Images can use local OCR (no upload) or AI vision (sent to your configured API).',
  图片识别方式: 'Image recognition mode',
  '每次询问（默认）': 'Ask every time (default)',
  '本地 OCR（离线）': 'Local OCR (offline)',
  'AI 识图（发送到 API）': 'AI vision (send to API)',
  关闭图片识别: 'Turn off image recognition',
  '未配置 AI 接口': 'AI endpoint not configured',
  '本地 OCR 首次使用需确认声明并加载约 5–10MB 语言包；缓存后可离线。AI 每次上传前都会再次确认。':
    'Local OCR asks for consent on first use and downloads about 5–10MB of language data; it then works offline. AI asks for confirmation before every upload.',
  图片识别已关闭: 'Image recognition is turned off',
  '未配置 AI 接口，无法使用 AI 识图': 'AI endpoint is not configured; AI vision is unavailable',
  '正在读取文档…': 'Reading document…',
  '文档已导入：{name}': 'Document imported: {name}',
  '文档已导入并截断到 5 万字：{name}': 'Document imported and truncated to 50k characters: {name}',
  '正在本地识别（首次需加载语言包，约 5–10MB，请稍候）…':
    'Running local OCR (first use downloads about 5–10MB of language data)…',
  '正在本地识别…': 'Running local OCR…',
  '本地识别完成，已填入收件框': 'Local OCR finished — text is in the Inbox box',
  '本地识别完成，文本已截断到 5 万字': 'Local OCR finished; text truncated to 50k characters',
  '正在调用 AI 识图…': 'Calling AI vision…',
  图片识别完成: 'Image recognition finished',
  '图片识别完成，请核对候选': 'Image recognition finished — review the candidates',
  '图片里没有识别出可用的待办': 'No usable to-dos found in the image',
  '选择图片识别方式': 'Choose how to recognize this image',
  '本地 OCR 不上传；AI 识图会把图片发送到你配置的服务。':
    'Local OCR never uploads; AI vision sends the image to your configured service.',
  本地识别说明: 'About local OCR',
  '在设备本地运行，不上传图片或识别结果。': 'Runs on your device; images and results are never uploaded.',
  '首次使用需下载语言包（约 5–10MB），缓存后可离线。':
    'First use downloads language data (about 5–10MB); it is cached for offline use afterwards.',
  '占用内存；单页识别约 2–8 秒（桌面）/ 5–15 秒（手机），低端设备可能卡顿。':
    'Uses memory; about 2–8s per page on desktop, 5–15s on phones, and may lag on low-end devices.',
  '手写、暗光、复杂排版识别率有限，请人工核对后再收录。':
    'Handwriting, low light and complex layouts reduce accuracy — please review before accepting.',
  同意并开始识别: 'Agree and start',
  确认发送图片: 'Confirm sending the image',
  '图片将发送到你配置的 AI 服务，用于识别文字并抽取待办。':
    'The image will be sent to your configured AI service to recognize text and extract to-dos.',
  我确认发送这张图片: 'I confirm sending this image',
  发送并识别: 'Send and recognize',
  '正在识别…': 'Recognizing…',
  '图片识别到 {n} 条': 'Found {n} items from the image',
  '该格式暂不支持': 'This file type is not supported',
  '旧版 Office 格式暂不支持，请另存为 .docx / .txt / .md 后再导入':
    'Legacy Office formats are not supported — save as .docx / .txt / .md first',
  '文件太大（文档最大 20MB，图片最大 10MB）': 'File too large (documents up to 20MB, images up to 10MB)',
  '文件里没有可识别的文字': 'No recognizable text in the file',
  '扫描版 PDF 暂时不支持，请拍照或截图后用图片识别':
    'Scanned PDFs are not supported yet — take a photo or screenshot and use image recognition',
  'PDF 读取失败，请确认文件没有加密或损坏': 'Failed to read PDF — check that it is not encrypted or damaged',
  'DOCX 读取失败，请确认文件没有损坏': 'Failed to read DOCX — check that it is not damaged',
  '文件读取失败，请重试': 'Failed to read the file — please retry',
  '本地识别失败，请重试或换一张更清晰的图片': 'Local OCR failed — retry or use a clearer image',
  '当前模型可能不支持图片识别，请换支持视觉的模型':
    'This model may not support image input — use a vision-capable model',
  'AI 识图失败，请检查网络与接口配置': 'AI vision failed — check your network and endpoint settings',
  '操作失败，请重试': 'Something went wrong — please retry',

  打开链接: 'Open link',
  备注: 'Note',

  '输入群消息': 'Type a group message',
  '从一条群通知开始': 'Start with a group notice',
  '贴一段群消息，拾穗会替你拆成待办。': 'Paste a group message and Shisui will break it into to-dos.',
  '这一天先空着': 'Nothing on this day yet',
  '把其他日子的任务拖过来，或去收件贴一条新的。': 'Drag tasks here from another day, or add a new one in Inbox.',
  '去收件': 'Go to Inbox',
  '还没有数据': 'No data yet',
  '收录第一条待办后，这里会显示你的完成率与解析质量。':
    'Accept your first to-do and your completion and parsing quality will show up here.',
  '今天先到这里': 'That is all for now',
  '没有未完成的任务了，休息一下。': 'No open tasks — take a break.',
  '数据只存本地，不上传服务器。': 'Data stays local and is never uploaded.',
  '作者：dream-office': 'Author: dream-office',
  'dream-office · 把散落的时间，一粒一粒捡起来。':
    'dream-office · Picking up the scattered moments, one grain at a time.',
  '源码（GitHub）': 'Source (GitHub)',

  作者签名: 'Author signature',

  '把散落的时间，一粒一粒捡起来。': 'Picking up the scattered moments, one grain at a time.',
  'dream-office 签名': 'dream-office signature',
  '关闭作者签名': 'Close signature',

  '有低置信度条目，已高亮标出，请人工核对': 'Some items have low confidence and are highlighted — please review before accepting.',
  邮箱: 'Email',
  飞书: 'Feishu',
  企业微信: 'WeCom',
  钉钉: 'DingTalk',
  'OA/审批系统': 'OA / Approval',
  学习通: 'Learning platform',
  腾讯会议: 'Tencent Meeting',
  线下: 'Offline',

  '批量模式：{sections} 段 → {tasks} 条（去重 {duplicates} 条）':
    'Batch mode: {sections} sections → {tasks} items ({duplicates} duplicates merged)',
  '规则引擎识别 {n} 条': 'Rule engine found {n} items',
  '规则 {rule} 条 + AI {ai} 条 → 合并后 {merged} 条（{agreed} 条双引擎一致，{llmOnly} 条 AI 补充）':
    'Rules {rule} + AI {ai} → {merged} merged ({agreed} agreed by both, {llmOnly} AI-only)',

  '报销/缴费': 'Payment / Reimbursement',
  高置信: 'High confidence',
  需确认: 'Needs confirmation',

  '项目群、部门群、班级群、家长群，说的是同一件事：':
    'Project, department, class or parent groups all say the same thing: ',

  '「本周五23:59前交实验报告」「下周三下午2点3楼会议室」「11月20日前提交报销单」——':
    '“Lab report due before Friday 23:59”, “next Wednesday 2pm, 3F meeting room”, “submit the expense report by Nov 20” —',

  '备份是一个 JSON 文件，包含全部任务、重复系列和历史记录。': 'A backup is a JSON file containing all tasks, recurring series and import history.',
  恢复会覆盖当前全部数据: 'Restoring replaces all current data',
  '，先下载一份再恢复最稳。': '. Download one before restoring.',
  '文件不加密（备份里没有 AI Key，但可能含通知原文），请自己保管好。': 'The file is unencrypted (no AI key inside, but it may contain original notices) — keep it safe.',
  '加密备份解锁': 'Unlock encrypted backup',
  '这是加密备份，输入导出时设置的密码来解锁。': 'This is an encrypted backup. Enter the password used at export time.',
  '解除密码': 'Password',
  '恢复预览': 'Restore preview',
  '这份备份导出时间：{time}，含 {tasks} 条任务、{series} 个重复系列、{batches} 条历史。':
    'Exported at {time}; contains {tasks} tasks, {series} series and {batches} history entries.',
  '确认后会清空当前数据并替换，不可撤销。': 'This replaces all current data and cannot be undone.',
  'AI 增强引擎（可选）': 'AI enhancement (optional)',
  '填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。':
    'Fill in any OpenAI-compatible endpoint to enable the hybrid engine. The rule engine still works offline without it, with lower tolerance for unusual phrasing.',
  'Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。':
    'The key is stored only in your localStorage; requests go straight to the provider you configure.',
  '已配置：解析时会尝试 AI，失败自动降级': 'Configured: AI is tried during parsing and falls back on failure',
  '未配置：只用规则引擎': 'Not configured: rule engine only',
  '默认不联网：数据只存在你自己的浏览器 IndexedDB 里；没有账号、没有服务器、不上传。':
    'Offline by default: data lives in your browser IndexedDB — no account, no server, no upload.',
  '唯一会出网的情况是你自己配置了 AI 接口并触发解析。':
    'The only network call happens when you configure an AI endpoint and trigger parsing.',
  '恢复会覆盖当前全部数据**，先下载一份再恢复最稳。': 'Restoring replaces all current data. Download one before restoring.',
  '备份密码': 'Backup password',
  '确认备份密码': 'Confirm backup password',
  '解密密码': 'Decryption password',
  '导出 JSON 备份': 'Export JSON backup',
  '选择备份文件恢复': 'Choose a backup file to restore',
  '解密并预览': 'Decrypt & preview',
  '确认恢复': 'Restore now',
  '已保存': 'Saved',
  '保存': 'Save',
  '密码': 'Password',
  '再输一次': 'Repeat password',
})

Object.assign(EN, {
  '{n} 字': '{n} chars',
  '历史 ({n})': 'History ({n})',
  '已收录 {n} 条，去「日程」看看有没有撞车': 'Accepted {n} to-dos — check Plan for conflicts',
  '例如：\n【项目群】张经理：\n1. 本周五18:00前把预算表发到财务邮箱。\n2. 下周一上午10点在 3楼会议室 开复盘会。\n\n或者学校通知：\n本周五23:59前在学习通提交实验报告三。':
    'e.g.\n[Project group] Manager Zhang:\n1. Send the budget sheet to finance before Friday 18:00.\n2. Retrospective meeting next Monday 10am in room 3F.\n\nOr a school notice:\nSubmit lab report 3 on the learning platform before Friday 23:59.',
  '分享内容': 'Shared content',
  '导入完成：新增 {added} 条 · 更新 {updated} 条 · 跳过 {skipped} 条':
    'Import done: {added} added · {updated} updated · {skipped} skipped',
  '历史': 'History',
  '正在解析…': 'Parsing…',
  '候选': 'Candidate',
  '跳过': 'Skipped',
  '更新': 'Update',
  '新增': 'New',
  '说明：': 'Note: ',
  '语言': 'Language',
  '界面语言': 'Interface language',
  '中文': '中文',
  'English': 'English',
  '保存中…': 'Saving…',
  '添加': 'Add',
  '先写一个标题': 'Write a title first',
  '时间格式不对，请重新选': 'Invalid time format — pick again',
  '添加失败': 'Failed to add',
  '任务 / 交付物': 'Task / deliverable',
  '会议 / 活动': 'Meeting / event',
  '评审 / 验收': 'Review / acceptance',
  '报名 / 登记': 'Sign-up / registration',
  '缴费 / 报销': 'Payment / reimbursement',
  '审批 / 确认': 'Approval / confirmation',
  '问卷 / 填表': 'Survey / form',
  '考试 / 测验': 'Exam / quiz',
  '其它': 'Other',
  '无时间': 'No time',
  '全天': 'All day',
  '另有 {n} 条提示': '+{n} more warnings',
  '…另有 {n} 条': '…and {n} more',
})

Object.assign(EN, {
  '备份是一个 JSON 文件，包含全部任务、重复系列和历史记录。': 'A backup is a JSON file containing all tasks, recurring series and import history.',
  恢复会覆盖当前全部数据: 'Restoring replaces all current data',
  '，先下载一份再恢复最稳。': '. Download one before restoring.',
  '文件不加密（备份里没有 AI Key，但可能含通知原文），请自己保管好。': 'The file is unencrypted (no AI key inside, but it may contain original notices) — keep it safe.',
  '加密备份解锁': 'Unlock encrypted backup',
  '这是加密备份，输入导出时设置的密码来解锁。': 'This is an encrypted backup. Enter the password used at export time.',
  '解除密码': 'Password',
  '恢复预览': 'Restore preview',
  '这份备份导出时间：{time}，含 {tasks} 条任务、{series} 个重复系列、{batches} 条历史。':
    'Exported at {time}; contains {tasks} tasks, {series} series and {batches} history entries.',
  '确认后会清空当前数据并替换，不可撤销。': 'This replaces all current data and cannot be undone.',
  'AI 增强引擎（可选）': 'AI enhancement (optional)',
  '填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。':
    'Fill in any OpenAI-compatible endpoint to enable the hybrid engine. The rule engine still works offline without it, with lower tolerance for unusual phrasing.',
  'Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。':
    'The key is stored only in your localStorage; requests go straight to the provider you configure.',
  '已配置：解析时会尝试 AI，失败自动降级': 'Configured: AI is tried during parsing and falls back on failure',
  '未配置：只用规则引擎': 'Not configured: rule engine only',
  '默认不联网：数据只存在你自己的浏览器 IndexedDB 里；没有账号、没有服务器、不上传。':
    'Offline by default: data lives in your browser IndexedDB — no account, no server, no upload.',
  '唯一会出网的情况是你自己配置了 AI 接口并触发解析。':
    'The only network call happens when you configure an AI endpoint and trigger parsing.',
  '恢复会覆盖当前全部数据**，先下载一份再恢复最稳。': 'Restoring replaces all current data. Download one before restoring.',
  '备份密码': 'Backup password',
  '确认备份密码': 'Confirm backup password',
  '解密密码': 'Decryption password',
  '导出 JSON 备份': 'Export JSON backup',
  '选择备份文件恢复': 'Choose a backup file to restore',
  '解密并预览': 'Decrypt & preview',
  '确认恢复': 'Restore now',
  '已保存': 'Saved',
  '保存': 'Save',
  '密码': 'Password',
  '再输一次': 'Repeat password',
})

Object.assign(EN, {
  事项类型: 'Item kind',
  待办标题: 'Task title',
  缺截止时间: 'No deadline',
  收录进日程: 'Add to plan',
  不要这条: 'Dismiss',
  '渠道 · {v}': 'Channel · {v}',
  '地点 · {v}': 'Location · {v}',
  '为什么这么判断（{n}）': 'Why ({n})',
  '原文：{v}': 'Original: {v}',
  规则: 'Rule',
  手动: 'Manual',
  导入: 'Import',
  规则引擎: 'Rule engine',
  无时间: 'No time',
  '收录选中（{n}）': 'Accept selected ({n})',
  字: 'chars',
  '正在解析…': 'Parsing…',
  候选: 'Candidate',
  历史: 'History',
  '已收录 {n} 条，去「日程」看看有没有撞车': 'Accepted {n} to-dos — check Plan for conflicts',
  '另有 {n} 条提示': '+{n} more warnings',
  '…另有 {n} 条': '…and {n} more',
  '导入完成：新增 {added} 条 · 更新 {updated} 条 · 跳过 {skipped} 条':
    'Import done: {added} added · {updated} updated · {skipped} skipped',
  '这个文件里没有可以导入的事件': 'No importable events in this file',
  读取文件失败: 'Failed to read the file',
  '写入失败，已回滚': 'Write failed and was rolled back',
  跳过: 'Skip',
  更新: 'Update',
  新增: 'New',
  '含重复事件（RRULE）：只导入首个实例，后续不自动展开。':
    'Contains recurring events (RRULE): the first occurrence is imported and not expanded automatically.',
  '来源：分享': 'From share',
  '历史 ({n})': 'History ({n})',
  重复: 'Recurring',
  未知错误: 'Unknown error',
  条: 'items',
  项: 'items',
  '全部任务': 'All tasks',
  '本周完成率': 'Completion this week',
  '解析手改率': 'Manual correction rate',
  '本周到期 {n} 件，已完成 {done} 件（按到期时间统计，不看完成时间）':
    '{n} due this week, {done} completed (counted by due time, not completion time)',
  '解析来源 {n} 件，其中你手动改过 {edited} 件（手动添加 / 日历导入不算）':
    'Parsed from {n} items, {edited} manually edited (manual additions / calendar imports excluded)',
  '批量完成 {n} 件': 'Completed {n} items',
  '批量取消完成 {n} 件': 'Marked {n} items incomplete',
  '批量删除 {n} 件': 'Deleted {n} items',
  撤销: 'Undo',
  '已选 {n} 件': '{n} selected',
  '选择「{v}」': 'Select “{v}”',
  '移除标签 {v}': 'Remove tag {v}',
  '已手改 {n} 处': 'Edited {n}',
  '{n} 件': '{n} items',
  '{m} 月 {d} 日，{n} 件事': '{m}/{d}, {n} items',
  '拾穗日程': 'Shisui plan',
  '撤销「{v}」': 'Undo “{v}”',
  '今天': 'Today',
  '昨天': 'Yesterday',
  '明天': 'Tomorrow',
  '已跳过': 'Skipped',
  '{v} 天': '{v} days',
  退出多选: 'Exit selection',
  多选: 'Select',
  '已完成 {n} 件': 'Completed {n}',
  重复规则: 'Recurrence',
  无: 'None',
  '已恢复 {n} 条任务、{series} 个系列': 'Restored {n} tasks and {series} series',
  恢复失败: 'Restore failed',
  解密失败: 'Decryption failed',
  '备份文件不合法': 'Invalid backup file',
  '解密后的备份不合法': 'Decrypted backup is invalid',
  密码不合法: 'Invalid password',
  语言: 'Language',
  界面语言: 'Interface language',
  中文: '中文',
  English: 'English',
  已完成: 'Completed',
  未完成: 'Open',
  '今': 'Today',
  '月': '/',
  '日': '',
  '年': '',
})


Object.assign(EN, {
  '备份是一个 JSON 文件，包含全部任务、重复系列和历史记录。': 'A backup is a JSON file containing all tasks, recurring series and import history.',
  恢复会覆盖当前全部数据: 'Restoring replaces all current data',
  '，先下载一份再恢复最稳。': '. Download one before restoring.',
  '文件不加密（备份里没有 AI Key，但可能含通知原文），请自己保管好。': 'The file is unencrypted (no AI key inside, but it may contain original notices) — keep it safe.',
  '加密备份解锁': 'Unlock encrypted backup',
  '这是加密备份，输入导出时设置的密码来解锁。': 'This is an encrypted backup. Enter the password used at export time.',
  '解除密码': 'Password',
  '恢复预览': 'Restore preview',
  '这份备份导出时间：{time}，含 {tasks} 条任务、{series} 个重复系列、{batches} 条历史。':
    'Exported at {time}; contains {tasks} tasks, {series} series and {batches} history entries.',
  '确认后会清空当前数据并替换，不可撤销。': 'This replaces all current data and cannot be undone.',
  'AI 增强引擎（可选）': 'AI enhancement (optional)',
  '填任意 OpenAI 兼容接口即可启用双引擎。不填也能用：规则引擎离线完成全部解析，只是对特别绕的写法容错更低。':
    'Fill in any OpenAI-compatible endpoint to enable the hybrid engine. The rule engine still works offline without it, with lower tolerance for unusual phrasing.',
  'Key 只保存在你自己的 localStorage，请求直接发给你填的服务商。':
    'The key is stored only in your localStorage; requests go straight to the provider you configure.',
  '已配置：解析时会尝试 AI，失败自动降级': 'Configured: AI is tried during parsing and falls back on failure',
  '未配置：只用规则引擎': 'Not configured: rule engine only',
  '默认不联网：数据只存在你自己的浏览器 IndexedDB 里；没有账号、没有服务器、不上传。':
    'Offline by default: data lives in your browser IndexedDB — no account, no server, no upload.',
  '唯一会出网的情况是你自己配置了 AI 接口并触发解析。':
    'The only network call happens when you configure an AI endpoint and trigger parsing.',
  '恢复会覆盖当前全部数据**，先下载一份再恢复最稳。': 'Restoring replaces all current data. Download one before restoring.',
  '备份密码': 'Backup password',
  '确认备份密码': 'Confirm backup password',
  '解密密码': 'Decryption password',
  '导出 JSON 备份': 'Export JSON backup',
  '选择备份文件恢复': 'Choose a backup file to restore',
  '解密并预览': 'Decrypt & preview',
  '确认恢复': 'Restore now',
  '已保存': 'Saved',
  '保存': 'Save',
  '密码': 'Password',
  '再输一次': 'Repeat password',
})

Object.assign(EN, {
  待核对: 'Needs review',
  '同一组只能选一个：「本周日」当天默认本周': 'Pick one from this group: “this Sunday” defaults to this week',
  '界面出了点问题，但你的数据还在': 'Something went wrong, but your data is safe',
  '待办都存在浏览器本地（IndexedDB），不会因为这次异常丢失。可以先重试；如果反复出现，回首页后手动导出备份。':
    'Tasks are stored locally in IndexedDB and are not lost because of this error. Try again first; if it keeps happening, go home and export a backup.',
  导入历史: 'Import history',
  '还没有收录过通知。贴一段、点「全部收录」之后，这里会留下原文，方便回看和二次收录。':
    'No notices accepted yet. After you paste one and tap “Accept all”, the original text is kept here for review and re-parsing.',
  重新解析: 'Re-parse',
  导入日历文件: 'Import calendar file',
  '支持系统日历 / Google Calendar 导出的': 'Supports exports from system calendars / Google Calendar',
  '。同一事件重复导入会更新，不会翻倍。': '. Re-importing the same event updates it instead of duplicating it.',
  '重复事件（RRULE）只导入首个实例。': 'Recurring events (RRULE) import the first occurrence only.',
  '· 新增': '· Added ',
  '/ 更新': ' / Updated ',
  确认导入: 'Confirm import',
  '导入 .ics': 'Import .ics',
  解析引擎: 'Parser',
  二选一: 'Choose one',
  '「本周日」当天有两种理解，选一个：': '“This Sunday” is ambiguous today — pick one:',
  它能认出什么: 'What it recognizes',
  '不区分场景：公司群、项目群、班级群、家长群、学校教务，同一套规则。':
    'Same rules for company, project, class, parent and school groups.',
  '本周五23:59 / 下周三 / 明晚8点 / 中午12点前 / 3天内 / 11月18日 / 周五下午2点':
    'Friday 23:59 / next Wednesday / tomorrow 8pm / before noon / within 3 days / Nov 18 / Friday 2pm',
  事项: 'Items',
  '任务与交付物、会议与培训、评审与验收、审批签字、报销缴费、报名、问卷打卡、考试':
    'Tasks & deliverables, meetings & training, reviews & acceptance, approvals, reimbursements, sign-ups, surveys, exams',
  提交渠道: 'Channels',
  '飞书、钉钉、企业微信、OA、Jira、在线文档、邮箱、学习通、腾讯会议、纸质线下':
    'Feishu, DingTalk, WeCom, OA, Jira, online docs, email, learning platform, Tencent Meeting, paper',
  不止于此: 'And more',
  '收录后会自动体检：已经过期、两件撞车、同一天堆三件，都会直接标出来':
    'After accepting, it runs a health check: overdue items, clashes and same-day pile-ups are flagged.',
  手动添加一条: 'Add manually',
  '口头通知、临时安排、或者解析结果想自己修 —— 都可以直接写在这里。不走解析引擎。':
    'Verbal notices, ad-hoc plans, or fixing parsed results — write it here directly. The parser is not used.',
  '手动添加的条目不进「导入历史」——历史只记录「粘贴 + 全部收录」的批次。':
    'Manual items are not recorded in Import history; only paste-and-accept batches are.',
  '例如：把报销单交给财务': 'e.g. hand the expense report to finance',
  截止时间: 'Deadline',
  '渠道（可选）': 'Channel (optional)',
  '学习通 / 邮箱 / 线下…': 'Learning platform / email / offline…',
  '地点（可选）': 'Location (optional)',
  '3 楼会议室': '3F meeting room',
  '← 上月': '← Prev',
  '下月 →': 'Next →',
  '未来 7 天压力': 'Next 7 days load',
  编辑标题: 'Edit title',
  编辑时间: 'Edit time',
  编辑类型: 'Edit kind',
  编辑渠道: 'Edit channel',
  编辑地点: 'Edit location',
  编辑标签: 'Edit tags',
  改哪里: 'Apply to',
})

Object.assign(EN, {
  '收录第一条待办后，这里会显示完成率、逾期、冲突与专注时长。':
    'Accept your first to-do to see completion, overdue, conflicts and focus time here.',
  '近 7 天专注': 'Focus in the last 7 days',
  '进入日程页的「专注模式」开始计时':
    'Open Focus mode on the Plan page to start tracking.',
  '共 {n} 次 · 今天 {m} 分钟': '{n} sessions · {m} min today',
  '未完成逾期分布': 'Open overdue distribution',
  '共 {n} 件': '{n} items',
  '当前没有逾期任务': 'No overdue tasks right now',
  '1 天内': 'Within 1 day',
  '1–3 天': '1–3 days',
  '3–7 天': '3–7 days',
  '7 天以上': 'Over 7 days',
  '按当前未完成任务计算': 'Based on current open tasks',
  '时间重叠': 'Time overlap',
  '截止撞车': 'Deadline clash',
  '同日堆积': 'Same-day pile-up',
  '{n} 分钟': '{n} min',
  '{h} 小时': '{h} h',
  '{h} 小时 {m} 分钟': '{h} h {m} min',
})

let currentLang: Lang = 'zh'

export function getLang(): Lang {
  return currentLang
}

export function setLang(lang: Lang): void {
  currentLang = lang
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
  }
}

export function t(key: string, params?: Record<string, string | number>): string {
  const template = currentLang === 'en' ? (EN[key] ?? key) : key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

/** 供「缺 key 检测」测试使用 */
export function hasEnglish(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(EN, key)
}

export function englishKeys(): string[] {
  return Object.keys(EN)
}



/** 相对日期 + 时刻：今天 18:00 / Tomorrow 6:00 PM */
export function formatWhenI18n(ms: number, ref: Date = new Date()): string {
  const day = new Date(ms)
  const refDay = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate())
  const targetDay = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  const diff = Math.round((targetDay.getTime() - refDay.getTime()) / 86_400_000)
  const clock = formatClockI18n(ms)
  if (currentLang === 'en') {
    if (diff === 0) return `Today ${clock}`
    if (diff === 1) return `Tomorrow ${clock}`
    if (diff === 2) return `In 2 days ${clock}`
    if (diff === -1) return `Yesterday ${clock}`
    return `${formatMonthDayI18n(ms)} ${clock}`
  }
  if (diff === 0) return `今天 ${clock}`
  if (diff === 1) return `明天 ${clock}`
  if (diff === 2) return `后天 ${clock}`
  if (diff === -1) return `昨天 ${clock}`
  return `${formatMonthDayI18n(ms)} ${formatWeekdayI18n(ms)} ${clock}`
}

/** 月历表头星期缩写 */
export function weekdayNarrowI18n(): string[] {
  if (currentLang === 'en') return ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return ['一', '二', '三', '四', '五', '六', '日']
}

/** 月视图标题：2026 年 11 月 / November 2026 */
export function monthLabelI18n(ms: number): string {
  if (currentLang === 'en') return dateFormatter({ month: 'long', year: 'numeric' }).format(ms)
  const d = new Date(ms)
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
}

/** 日期 + 件数（月历当天面板） */
export function dayHeadingI18n(ms: number): string {
  if (currentLang === 'en') return dateFormatter({ month: 'long', day: 'numeric', weekday: 'long' }).format(ms)
  const d = new Date(ms)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${formatWeekdayI18n(ms)}`
}

/** 重复规则描述（英文模式用，纯展示） */
export function describeRuleI18n(rrule: string): string {
  const value = rrule.toUpperCase()
  const freq = /FREQ=([A-Z]+)/.exec(value)?.[1] ?? ''
  const interval = Number(/INTERVAL=(\d+)/.exec(value)?.[1] ?? 1)
  const byDay = /BYDAY=([A-Z,]+)/.exec(value)?.[1]
  const monthDay = /BYMONTHDAY=(\d+)/.exec(value)?.[1]
  const count = /COUNT=(\d+)/.exec(value)?.[1]
  if (currentLang !== 'en') return ''
  const map: Record<string, string> = { MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun' }
  let text = ''
  if (freq === 'DAILY') text = interval > 1 ? `Every ${interval} days` : 'Daily'
  else if (freq === 'WEEKLY') {
    const days = byDay ? byDay.split(',').map((d) => map[d] ?? d).join(', ') : ''
    text = `${interval > 1 ? `Every ${interval} weeks` : 'Weekly'}${days ? ` on ${days}` : ''}`
  } else if (freq === 'MONTHLY') {
    text = `${interval > 1 ? `Every ${interval} months` : 'Monthly'}${monthDay ? ` on day ${monthDay}` : ''}`
  }
  if (count) text += `, ${count} times`
  return text
}

const NfCache = new Map<string, Intl.NumberFormat>()
export function formatNumber(value: number): string {
  const locale = currentLang === 'en' ? 'en-US' : 'zh-CN'
  let formatter = NfCache.get(locale)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale)
    NfCache.set(locale, formatter)
  }
  return formatter.format(value)
}

const DfCache = new Map<string, Intl.DateTimeFormat>()
function dateFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = currentLang === 'en' ? 'en-US' : 'zh-CN'
  const key = `${locale}:${JSON.stringify(options)}`
  let formatter = DfCache.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    DfCache.set(key, formatter)
  }
  return formatter
}

/** 时刻：zh 09:00 / en 9:00 AM */
export function formatClockI18n(ms: number): string {
  return dateFormatter({ hour: '2-digit', minute: '2-digit' }).format(ms)
}

/** 日期：zh 11月8日 / en Nov 8 */
export function formatDateOnlyI18n(ms: number): string {
  return dateFormatter({ year: 'numeric', month: 'numeric', day: 'numeric' }).format(ms)
}

export function formatMonthDayI18n(ms: number): string {
  return dateFormatter({ month: 'short', day: 'numeric' }).format(ms)
}

/** 星期：zh 星期日 / en Sunday */
export function formatWeekdayI18n(ms: number): string {
  return dateFormatter({ weekday: 'long' }).format(ms)
}

/** 完整日期：zh 11月8日 星期日 / en Sunday, Nov 8 */
export function formatFullDayI18n(ms: number): string {
  return dateFormatter({ month: 'short', day: 'numeric', weekday: 'long' }).format(ms)
}

/** 相对时间文案：返回纯文本 + 紧急程度 */
export function countdownI18n(ms: number, ref: Date = new Date()): { text: string; tone: 'overdue' | 'soon' | 'later' } {
  const diff = ms - ref.getTime()
  const abs = Math.abs(diff)
  const minutes = Math.round(abs / 60_000)
  const hours = Math.round(abs / 3_600_000)
  const days = Math.round(abs / 86_400_000)
  const tone: 'overdue' | 'soon' | 'later' = diff < 0 ? 'overdue' : abs <= 2 * 3_600_000 ? 'soon' : 'later'

  if (currentLang === 'en') {
    if (diff < 0) {
      if (days >= 1) return { text: `overdue by ${days}d`, tone }
      if (hours >= 1) return { text: `overdue by ${hours}h`, tone }
      return { text: `overdue by ${minutes}m`, tone }
    }
    if (days >= 1) return { text: `in ${days}d`, tone }
    if (hours >= 1) return { text: `in ${hours}h`, tone }
    return { text: `in ${minutes}m`, tone }
  }

  if (diff < 0) {
    if (days >= 1) return { text: `已过期 ${days} 天`, tone }
    if (hours >= 1) return { text: `已过期 ${hours} 小时`, tone }
    return { text: `已过期 ${minutes} 分钟`, tone }
  }
  if (days >= 1) return { text: `剩 ${days} 天`, tone }
  if (hours >= 1) return { text: `剩 ${hours} 小时`, tone }
  return { text: `剩 ${minutes} 分钟`, tone }
}


import { CORE_MESSAGES } from './core'
import type { LocalizedMessage } from 'shisui-core'

/** 渲染 core 的 code+params；缺 key 时回退旧中文，保证旧数据不崩 */
export function tCore(msg?: LocalizedMessage, fallback?: string): string {
  if (!msg) return fallback ?? ''
  const entry = CORE_MESSAGES[msg.code]
  const lang = getLang()
  let text = entry ? entry[lang] : (fallback ?? msg.code)
  for (const [key, raw] of Object.entries(msg.params ?? {})) {
    const value = String(raw)
    const nested = CORE_MESSAGES[value]
    text = text.split(`{${key}}`).join(nested ? nested[lang] : value)
  }
  return text
}
