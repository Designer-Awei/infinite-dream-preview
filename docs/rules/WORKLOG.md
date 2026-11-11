# 结构化工作日志

唯一持续维护文件：仓库根目录 worklog.jsonl。UTF-8、每行一个 JSON 对象，无空行，日期使用北京时间。按独立问题/变更记录；新条目与它记录的改动放在同一个提交里（见“单提交写入”），不再单独提交纯日志。

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
python tools/worklog.py --pending
```

--all 合并同级两个仓库，--repo 可限定仓库。--pending 列出已写入但还没提交的单提交条目。--fields 可限制返回字段，--include-logs 显示历史纯日志提交；查 commit 时自动包含它们。不要直接把整份 JSONL 或旧归档载入对话。

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
- commit_ids：本仓完整40位commit数组；没有核实关联时为空，不填预计hash。GitHub链接可由repository和hash直接构成。单提交条目在这里只列同一轮里更早的提交，它自己所在的提交由工具从历史反查，查询输出里自动补在末尾。
- related_commits：其他仓库相关提交，元素为repository和id，避免把预览和正式同步hash混为一谈。
- status：committed / verified / pending / reverted / superseded。撤回或替代时填写superseded_by。
- validation：status为not_recorded / reported / passed / failed，summary最多200字，refs引用详细证据。reported表示旧日志的记载，不表示本次重新跑过测试。
- release_status：unknown / reported_success / reported_failure / not_released。迁移时不凭“构建通过”推断发布成功，未知保留unknown。
- superseded_by：明确替代本条目的条目ID数组，不能因出现相同关键词自动判定。
- source：原始归档文件及行范围，或git字段引用完整commit；单提交条目固定为{"self":true}，表示“首次把这一行加入日志的那个提交”。归档保留原字节并记录SHA-256。
- order：北京时间实际提交时间的Unix秒×100，加条目序号，用于同一天内跨仓排序，不表示版本或优先级。

字段约束见worklog.schema.json，tools/worklog.py --validate还检查本地commit、条目关系、原文来源、归档哈希和历史提交覆盖。

## 记录粒度

- 一条记录对应一个用户可感知的问题或需求，而不是一次提交。同一轮反馈里对同一模块的连续微调（间距、字号、对齐、颜色等）合并为一条，commit_ids 列出这一轮里更早的提交，最后一个提交带上这条记录。
- 互不相关的修复仍分开记录，便于按模块、关键词检索。
- 同步正式版的条目从简：module 用 release.promotion，title 写“同步：主要内容”，solution 写源预览提交与同步了哪些文件、保留了哪些正式版配置，related_commits 指向预览仓的改动提交；validation.summary 一两句即可。正式版未做实机/公网/CI 核实时照实写明。
- 玩法现状写在 docs/references/GAMEPLAY.md，只写“现在是什么样”；“改为…”“比原来…”“此前…”这类变更过程只写在日志里。

## 单提交写入

改完代码后，不先提交：直接用 --append 追加条目，输入里不给 commit_ids（或只给同一轮更早的提交），工具会写成 source {"self":true}；然后把改动与 worklog.jsonl 一起 git add，一次提交、一次推送。提交前可用 --pending 确认条目在等待提交。--validate 会检查：单提交条目所在的提交必须同时包含真实改动，只提交日志会报错。

旧条目（引用已有 hash 的写法）保持不变；需要补记已经存在的提交时，仍可在输入里给出完整 hash，工具按原方式写入。

## 追加与交接

通过写入接口追加条目（单提交写入，或引用已存在的真实hash）。新执行者显式填写worker和依据，不修改过去的worker来伪造接手历史。修复状态和发布状态分别更新；详细证据单独引用。Agent不直接重写JSONL源文件，人工确需手动编辑后也必须运行校验。

## 精确写入接口

Python函数：build_entry(root, fields)、append_entry(root, fields)、get_entry(root, id)、update_entry(root, id, patch, expected_revision=...)。append_entry接受单个对象或对象数组；批量写入整体成功或整体拒绝。worker、module、title、solution、commit_ids由执行者明确提供；编号、北京时间日期、来源、默认状态等机械字段由函数补齐，源commit必须已经存在。

```sh
python tools/worklog.py --append ../.cache/new-entry.json --dry-run
python tools/worklog.py --append ../.cache/new-entry.json
git add -A && git commit   # 改动与日志同一个提交
python tools/worklog.py --get 条目编号
python tools/worklog.py --update 条目编号 --input ../.cache/patch.json --expect-revision 上一步返回的revision --dry-run
python tools/worklog.py --update 条目编号 --input ../.cache/patch.json --expect-revision 上一步返回的revision
```

JSON输入也可用“-”从标准输入读取。--repo可指定同级目标仓库，写入不接受--all，避免一次操作误改两仓。

新增时提供worker、module、title、solution四项即可（commit_ids可省略＝单提交写入）；建议同时提供problem和validation。更新按唯一id定位，只替换patch指定字段；validation子字段合并保留其他证据。id和repository不能通过更新更换，修正worker必须同时提供worker_basis。

get_entry返回条目及整份日志的revision。更新必须携带这个revision；期间即使只新增了其他条目，也会拒绝旧revision，重新读取后再更新。写入前检查全部字段、commit、来源、替代关系及历史覆盖；项目.cache内的互斥锁防止同时写入，临时文件写完后原子替换。新增保持全部旧行原字节，更新保持其他行原字节。重复编号、无效字段/commit、来源越界或关系循环均拒绝，--dry-run不改日志。

函数只写数据，不执行git commit或push；单提交写入后由执行者把改动和日志一起提交。不会自动编造验证或发布成功。

本次迁移覆盖两仓全部可达主线历史。旧MD每个有效变更拆为条目；未覆盖的commit从Git补全，缺少验证的保留not_recorded。历史MD只归档，不维护第二套日志。migration.json记录迁移时的提交边界、覆盖数量及原文哈希。
