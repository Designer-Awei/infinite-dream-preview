# 工作记录

从 2026-11-02 本次建立记录起，记录本仓库后续每个更新项及其对应 commit，不追溯此前变更。日期使用 Asia/Shanghai（北京时间），最新记录置于最前。

每条记录包含日期、更新内容、对应 commit 链接及验证结果。同一次推送中的多个更新项应分别说明，可引用相同 commit；跨多个 commit 的更新应列全相关 commit。

先提交实际更新，再将生成的 commit 写入本文档并提交日志，最后一起推送。仅用于补记本文档的日志 commit 不另建条目，避免自引用；禁止填写预测的 commit 哈希或尚未执行的验证结果。

## 更新记录

### 2026-11-02 · 建立工作记录与推送约定

- 更新内容：新增根目录 `WORK_LOG.md`，从本次变更开始按更新项记录内容、对应 commit 和验证结果。
- 更新内容：新增 `AGENTS.md` 与始终生效的 `.cursor/rules/work-log.mdc`，要求后续每次推送前补齐记录，并明确纯日志提交免于另建条目的规则。
- 对应 commit：[2712e7a](https://github.com/Designer-Awei/infinite-dream-preview/commit/2712e7a4e8e39d2006e482673358bd4ecde0adb3)。
- 验证：`git diff --check` 通过；使用 `git cat-file -e` 确认引用的 commit 存在。本次为文档与工作约定变更，无需重新构建游戏。
