# GitHub Actions 与 SSH 调试更新设计

## 目标

恢复按需启用的外部 SSH 调试，将现有 GitHub Actions 更新到稳定版本，并消除已归档 Action 带来的 Node 20 运行时。

## SSH 调试

- 用 `owenthereal/action-upterm@v1.15.0` 替换 `mxschmitt/action-tmate@v3`，避开当前无法从外部连接的 tmate 公共中继。
- 将 `workflow_dispatch.inputs.ssh` 定义为布尔值，默认值为 `false`；默认构建不创建远程会话。
- 保留 `repository_dispatch` 的显式 `ssh` 事件触发能力。
- 仅在显式启用时启动 Upterm，并明确设置 `limit-access-to-actor: false`。
- 无鉴权是用户确认的取舍：任何取得临时连接地址的人都能访问 Runner，因此连接地址不得另行公开或转发。
- 保留阻塞式调试行为；在远程会话中创建 `$GITHUB_WORKSPACE/continue` 后继续后续构建。

## Action 版本

| 当前引用 | 目标引用 |
| --- | --- |
| `actions/checkout@main` | `actions/checkout@v7.0.1` |
| `jlumbroso/free-disk-space@main` | `jlumbroso/free-disk-space@v1.3.1` |
| `mxschmitt/action-tmate@v3` | `owenthereal/action-upterm@v1.15.0` |
| `actions/upload-artifact@main` | `actions/upload-artifact@v7.0.1` |
| `softprops/action-gh-release@v1` | `softprops/action-gh-release@v3.0.2` |
| `GitRML/delete-workflow-runs@main` | `Mattraks/delete-workflow-runs@v2.1.0` |
| `dev-drprasad/delete-older-releases@v0.3.4` | `actions/github-script@v9.0.0` |
| `actions/cache@v4` | `actions/cache@v6.1.0` |
| `peter-evans/repository-dispatch@v3` | `peter-evans/repository-dispatch@v4.0.1` |
| `Mattraks/delete-workflow-runs@v2` | `Mattraks/delete-workflow-runs@v2.1.0` |

## Release 清理

- 用官方 `actions/github-script@v9.0.0` 的 Node 24 运行时直接调用 GitHub REST API。
- 分页读取仓库全部 Release，排除 draft 后按 `published_at` 从新到旧排序。
- 保留最新 10 个非 draft Release，依次删除其余 Release 及对应的 `tags/<tag_name>` 引用。
- 没有待清理项时正常结束；任一 Release 或 tag 删除失败时终止步骤并保留错误，延续旧 Action 的失败语义。
- 复用当前 `GITHUB_TOKEN` 权限，不引入新的 Secret 或第三方清理 Action。

## 验证

- 在修改前运行引用断言并确认失败。
- 用固定 Release 样本验证排除 draft、发布时间排序和保留 10 个的筛选算法。
- 修改后解析两份 workflow YAML，并检查事件输入、条件和所有 `uses:` 引用。
- 用 `git ls-remote` 确认每个目标 tag 存在。
- 检查本次增量差异只涉及设计/计划文档和 `build-openwrt.yml`。
