# 数据格式冻结（v1.0）

> 当前适用：**app 1.6.0 / core 1.4.0（DB v5 / backupSchema 5）**；v1.0 的 DB v3/backupSchema 3 与 v1.2 的 v4 结构仍向下兼容。

> v1.0 起以下结构**冻结**；变更需升版本并写迁移说明。v1.2 起 DB v4：tasks/series 增加 `url`/`note`。v1.6 起 **DB v5**：tasks 增加 `doneAt`（实际完成时刻）。
> 所有数据默认只存在用户浏览器 IndexedDB 里。

## 1. IndexedDB（DB v5）

| store | key | 索引 |
| --- | --- | --- |
| `tasks` | `id` | `dueAt`, `startAt`, `endAt`, `done`, `kind`, `createdAt`, `sourceUid`, `seriesId`, `allDay` |
| `batches` | `id` | — |
| `series` | `id` | `startAt` |

### Task 关键字段

- `dueAt` / `startAt`：二选一（截止时刻 / 开始时刻）
- `endAt`：**exclusive** 结束时刻（与 ICS DTEND 一致）
- `allDay`：全天标记；老数据的全天锚点仍是 `dueAt=本地 00:00`
- `rrule` / `seriesId` / `recurrenceIndex` / `skipped`：重复任务
- `tags`：普通字段（无索引；写入层统一小写）
- `sourceUid`：ICS 去重标识
- `url` / `note`：报名/考试链接（仅 http/https）与备注（v4 新增；旧数据迁移后为 null）

### Series 关键字段

`id`, `rrule`, `anchorDay`, `anchorWeekday`, `startAt`, `endAt`, `allDay`,
`title`, `kind`, `channel`, `location`, `url`, `note`, `count`, `until`, `createdAt`, `endedAt`, `tags`

## 2. JSON 备份（backupVersion 1）

```json
{
  "format": "shisui-backup",
  "backupVersion": 1,
  "appVersion": "1.0.0",
  "schemaVersion": 5,
  "exportedAt": "2026-11-08T10:00:00.000Z",
  "tasks": [],
  "series": [],
  "batches": [],
  "settings": {}
}
```

- 恢复：**先校验 → 用户确认 → 单事务 replace**；非法/过新文件不改现有数据
- v3 旧备份缺 `url/note` 时补 null；v4 起导出包含两字段；未知字段白名单丢弃
- 不导出 AI `apiKey`

## 3. 加密备份（encryptedVersion 1）

`format: "shisui-backup-encrypted"`，字段：
`encryptedVersion`, `kdf { name: PBKDF2, hash: SHA-256, iterations: 310000, salt }`,
`cipher: AES-GCM`, `iv`（12B）, `data`（base64 密文）

- salt 16B / IV 12B / AES-GCM 256
- 密码 ≥ 8 位；密码错误与文件损坏统一报「密码错误或文件已损坏」
- 密码不落盘、不进日志

## 4. ICS（v1.0 子集 + v1.2 URL/note）

- 导出：UTC（`...Z`），全天用 `VALUE=DATE`；`endAt` 对齐 `DTEND`（exclusive）
- v1.2：导出 `URL:` 与 `DESCRIPTION:`（note），导入还原 `url`/`note`
- 重复任务：一个系列只导出一次 `RRULE` 主事件；结束系列用 `UNTIL` 截断
- 导入支持：`FREQ=DAILY|WEEKLY|MONTHLY`、`INTERVAL`、`BYDAY`（WEEKLY）、`COUNT`、`UNTIL`
- 不支持的规则按单次事件导入并给 warning

## 5. 迁移策略

- DB v2 → v3：只补字段默认值（`endAt=null`、`allDay` 按 00:00 推断等），不改写老值、不丢数据
- DB v3 → v4：只补 `url=null, note=null`（tasks 与 series），幂等、不改写老值
- 备份版本：`backupVersion > 1` 或 `schemaVersion > 4` 拒绝导入
- v1.0 不做数据结构变更；新增功能不得破坏以上格式
