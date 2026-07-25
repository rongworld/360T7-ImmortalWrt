# GitHub Actions and SSH Debug Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failing tmate relay with opt-in Upterm debugging and update every workflow Action reference to the approved stable version.

**Architecture:** Keep the existing two-workflow structure. Change only the manual SSH input, its debug Action, and `uses:` references; preserve build, dispatch, upload, and retention behavior.

**Tech Stack:** GitHub Actions YAML, Node.js assertions, actionlint, Git remote tag verification.

## Global Constraints

- SSH remains disabled by default through a boolean `ssh` input with default `false`.
- Upterm runs only after explicit manual or repository-dispatch SSH activation.
- Upterm uses the user-approved `limit-access-to-actor: false` setting.
- Preserve blocking debug behavior and the existing build sequence.
- Do not add custom Release-deletion code; keep the archived cleanup Action at its final `v0.3.4` release.
- Do not change OpenWrt scripts, package configuration, schedules, upload settings, or retention values.

---

### Task 1: Update both workflows

**Files:**
- Modify: `.github/workflows/build-openwrt.yml:28-208`
- Modify: `.github/workflows/update-checker.yml:37-58`
- Test: inline Node.js desired-state assertion

**Interfaces:**
- Consumes: `workflow_dispatch.inputs.ssh`, `github.event.action`, existing Action inputs and secrets.
- Produces: opt-in Upterm access and updated Action implementations without changing downstream build behavior.

- [ ] **Step 1: Run the desired-state assertion before editing**

```bash
node <<'NODE'
const fs = require('fs');
const build = fs.readFileSync('.github/workflows/build-openwrt.yml', 'utf8');
const checker = fs.readFileSync('.github/workflows/update-checker.yml', 'utf8');
const buildRequired = [
  'type: boolean',
  'default: false',
  'uses: actions/checkout@v7.0.1',
  'uses: jlumbroso/free-disk-space@v1.3.1',
  'uses: owenthereal/action-upterm@v1.15.0',
  "if: ${{ inputs.ssh || contains(github.event.action, 'ssh') }}",
  'limit-access-to-actor: false',
  'uses: softprops/action-gh-release@v3.0.2',
  'uses: Mattraks/delete-workflow-runs@v2.1.0',
  'uses: dev-drprasad/delete-older-releases@v0.3.4',
];
const checkerRequired = [
  'uses: actions/cache@v6.1.0',
  'uses: peter-evans/repository-dispatch@v4.0.1',
  'uses: Mattraks/delete-workflow-runs@v2.1.0',
];
for (const value of buildRequired) {
  if (!build.includes(value)) throw new Error(`build missing: ${value}`);
}
for (const value of checkerRequired) {
  if (!checker.includes(value)) throw new Error(`checker missing: ${value}`);
}
if ((build.match(/uses: actions\/upload-artifact@v7\.0\.1/g) || []).length !== 2) {
  throw new Error('actions/upload-artifact@v7.0.1 must appear twice');
}
for (const value of ['mxschmitt/action-tmate', 'GitRML/delete-workflow-runs']) {
  if (build.includes(value)) throw new Error(`obsolete build reference: ${value}`);
}
NODE
```

Expected: FAIL with `build missing: type: boolean` because the approved state is not present yet.

- [ ] **Step 2: Replace the SSH input and debug step**

Use these exact YAML blocks:

```yaml
  workflow_dispatch:
    inputs:
      ssh:
        description: 'SSH connection to Actions'
        type: boolean
        required: false
        default: false
```

```yaml
    - name: SSH connection to Actions
      uses: owenthereal/action-upterm@v1.15.0
      if: ${{ inputs.ssh || contains(github.event.action, 'ssh') }}
      with:
        limit-access-to-actor: false
```

Remove the inactive commented `P3TERX/ssh2actions` and Telegram lines.

- [ ] **Step 3: Update the build-workflow Action references**

```text
actions/checkout@main -> actions/checkout@v7.0.1
jlumbroso/free-disk-space@main -> jlumbroso/free-disk-space@v1.3.1
actions/upload-artifact@main -> actions/upload-artifact@v7.0.1
softprops/action-gh-release@v1 -> softprops/action-gh-release@v3.0.2
GitRML/delete-workflow-runs@main -> Mattraks/delete-workflow-runs@v2.1.0
dev-drprasad/delete-older-releases@v0.2.1 -> dev-drprasad/delete-older-releases@v0.3.4
```

- [ ] **Step 4: Update the source-check workflow Action references**

```text
actions/cache@v4 -> actions/cache@v6.1.0
peter-evans/repository-dispatch@v3 -> peter-evans/repository-dispatch@v4.0.1
Mattraks/delete-workflow-runs@v2 -> Mattraks/delete-workflow-runs@v2.1.0
```

- [ ] **Step 5: Re-run the desired-state assertion**

Run the Step 1 Node.js command again.

Expected: PASS with exit code 0 and no output.

- [ ] **Step 6: Review and commit the workflow changes**

```bash
git diff --check -- .github/workflows
git diff -- .github/workflows
git add .github/workflows/build-openwrt.yml .github/workflows/update-checker.yml
git commit -m "ci: update Actions and replace tmate"
```

### Task 2: Validate syntax and upstream references

**Files:**
- Verify: `.github/workflows/build-openwrt.yml`
- Verify: `.github/workflows/update-checker.yml`
- Verify: `docs/superpowers/specs/2026-07-25-actions-and-ssh-debug-design.md`

**Interfaces:**
- Consumes: the completed workflow changes from Task 1.
- Produces: lint, upstream-tag, whitespace, and repository-state evidence.

- [ ] **Step 1: Download actionlint into `/tmp` and lint both workflows**

```bash
rm -rf /tmp/actionlint-check
mkdir -p /tmp/actionlint-check
ACTIONLINT_TAG="$(curl -fsSL https://api.github.com/repos/rhysd/actionlint/releases/latest | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).tag_name))")"
ACTIONLINT_VERSION="${ACTIONLINT_TAG#v}"
curl -fsSL "https://github.com/rhysd/actionlint/releases/download/${ACTIONLINT_TAG}/actionlint_${ACTIONLINT_VERSION}_linux_x86_64.tar.gz" | tar -xz -C /tmp/actionlint-check actionlint
/tmp/actionlint-check/actionlint .github/workflows/build-openwrt.yml .github/workflows/update-checker.yml
```

Expected: exit code 0 with no diagnostics.

- [ ] **Step 2: Verify every selected upstream tag exists**

```bash
while read -r repository tag; do
  git ls-remote --exit-code "https://github.com/${repository}.git" "refs/tags/${tag}"
done <<'EOF'
actions/checkout v7.0.1
jlumbroso/free-disk-space v1.3.1
owenthereal/action-upterm v1.15.0
actions/upload-artifact v7.0.1
softprops/action-gh-release v3.0.2
Mattraks/delete-workflow-runs v2.1.0
dev-drprasad/delete-older-releases v0.3.4
actions/cache v6.1.0
peter-evans/repository-dispatch v4.0.1
EOF
```

Expected: nine non-empty ref results and overall exit code 0.

- [ ] **Step 3: Review the final repository state**

```bash
git diff --check
git log -n 4 --oneline --decorate
git status --short --branch
```

Expected: no whitespace errors; only the approved documentation and workflow commits are ahead of `origin/main`; the worktree is clean.

