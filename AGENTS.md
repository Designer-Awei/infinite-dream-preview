# Agent入口

- 完整约定：[开发与发布规则](docs/rules/WORKFLOW.md)。
- 唯一持续维护日志：[worklog.jsonl](worklog.jsonl)，必须填写worker，禁止继续追加WORK_LOG.md。
- 先用 python tools/worklog.py 关键词 --limit 5 定位条目；跨仓加 --all；按需 --full 或 --detail，不整篇载入。
- 字段和追加规则：[WORKLOG.md](docs/rules/WORKLOG.md)。写入后执行 python tools/worklog.py --validate。
- 写日志用tools/worklog.py --append或--get/--update，先--dry-run；禁止Agent手工重写JSONL。函数不会自动执行git提交/推送。
- 所有产物只在E:/Rouge-Game，先预览验证，正式仓需用户当前确认；真实变更提交后再记日志并推送，保留身份及CI/CD。
