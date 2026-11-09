# 结构化工作日志

唯一持续维护文件：仓库根目录 worklog.jsonl。UTF-8、每行一个 JSON 对象，无空行，日期使用北京时间。按独立问题/变更记录；新提交的纯日志维护不自引用。

## 检索

从仓库执行，默认只返回最新8条的简短字段，隐藏旧的纯日志提交。查询词为 AND 匹配，也搜索原始证据，不因摘要截短而漏掉关键词。

```sh
python tools/worklog.py 火球 --worker Codex --limit 3
python tools/worklog.py --all --worker Claude --until 2026-11-05 --limit 5
python tools/worklog.py --all --module pets.fox --since 2026-11-06
python tools/worklog.py --commit f659337 --full
python tools/worklog.py --id 条目编号 --detail
python tools/worklog.py --all --stats
python tools/worklog.py --all --validate
```

--all 合并同级两个仓库，--repo 可限定仓库。--fields 可限制返回字段，--include-logs 显示历史纯日志提交；查 commit 时自动包含它们。不要直接把整份 JSONL 或旧归档载入对话。

## 字段

- id：稳定唯一编号。新增条目不重用、重排或重编号旧条目。
- date：变更记录的北京时间日期，YYYY-MM-DD。
- repository：infinite-dream-preview 或 infinite-dream。
- worker：实际执行者，Codex / Claude / human / mixed / unknown。与 Git 作者账号分开，不能看到用户身份就判为人工操作。
- worker_basis：归属依据。用户确认11月6日前非Codex工作均由Claude完成，包括Claude借用用户身份的提交；19f2d85/e02eae3为核实交接基线，后续已核实工作归Codex。若另有明确Codex历史证据，按commit逐条覆盖，不只按日期或账号猜测。
- kind：change为独立变更；historical_commit为缺少旧MD说明的历史提交；log_commit为历史纯日志提交。后两类也保留完整commit供全局检索。
- module：可筛选的模块，例如pets.dragon、pets.fox、movement、ui.exchange、network。
- title：短标题，最多120字。
- problem：问题描述；旧记录未写清时为null，不补造原因。
- solution：修复/变更方案，最多300字；长过程保存在source引用的原文中。
- commit_ids：本仓完整40位commit数组；没有核实关联时为空，不填预计hash。GitHub链接可由repository和hash直接构成。
- related_commits：其他仓库相关提交，元素为repository和id，避免把预览和正式同步hash混为一谈。
- status：committed / verified / pending / reverted / superseded。撤回或替代时填写superseded_by。
- validation：status为not_recorded / reported / passed / failed，summary最多200字，refs引用详细证据。reported表示旧日志的记载，不表示本次重新跑过测试。
- release_status：unknown / reported_success / reported_failure / not_released。迁移时不凭“构建通过”推断发布成功，未知保留unknown。
- superseded_by：明确替代本条目的条目ID数组，不能因出现相同关键词自动判定。
- source：原始归档文件及行范围，或git字段引用完整commit。归档保留原字节并记录SHA-256。
- order：北京时间实际提交时间的Unix秒×100，加条目序号，用于同一天内跨仓排序，不表示版本或优先级。

字段约束见worklog.schema.json，tools/worklog.py --validate还检查本地commit、条目关系、原文来源、归档哈希和历史提交覆盖。

## 追加与交接

先提交实际变更，再追加引用真实hash的条目。新执行者显式填写worker和依据，不修改过去的worker来伪造接手历史。修复状态和发布状态分别更新；详细证据单独引用。人工可直接编辑JSONL，保存后运行校验。

本次迁移覆盖两仓全部可达主线历史。旧MD每个有效变更拆为条目；未覆盖的commit从Git补全，缺少验证的保留not_recorded。历史MD只归档，不维护第二套日志。migration.json记录迁移时的提交边界、覆盖数量及原文哈希。
