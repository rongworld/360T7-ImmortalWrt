# Node 24 Release Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the archived Node 20 Release-cleanup Action with tested cleanup logic executed by official `actions/github-script@v9.0.0` on Node 24.

**Architecture:** Keep the destructive selection logic in a small CommonJS module under `.github/scripts/` so it can be tested with Node's standard test runner. The workflow invokes that module through `actions/github-script`, which supplies authenticated Octokit, workflow context, and logging.

**Tech Stack:** GitHub Actions YAML, `actions/github-script@v9.0.0`, CommonJS, `node:test`, actionlint.

## Global Constraints

- Exclude draft Releases.
- Sort non-draft Releases by `published_at` descending and keep the newest 10.
- Delete every older Release followed by its corresponding `tags/<tag_name>` reference.
- Propagate any list, Release deletion, or tag deletion error so the workflow step fails.
- Use the existing `GITHUB_TOKEN`; add no Secret and no third-party cleanup Action.
- No referenced Action may declare `using: node20`.
- Do not change firmware upload, workflow-run retention, SSH debugging, schedules, or build commands.

---

### Task 1: Implement and test Release selection and deletion

**Files:**
- Create: `.github/scripts/delete-old-releases.js`
- Create: `.github/scripts/delete-old-releases.test.js`

**Interfaces:**
- Consumes: `{ github, context, core }` from `actions/github-script` and an optional numeric `keepLatest` value.
- Produces: `cleanupReleases(options): Promise<void>` and `selectOldReleases(releases, keepLatest): Release[]`.

- [ ] **Step 1: Write the failing test**

Create `.github/scripts/delete-old-releases.test.js`:

```js
const assert = require('node:assert/strict')
const test = require('node:test')

const cleanupReleases = require('./delete-old-releases')
const { selectOldReleases } = cleanupReleases

function releaseFixture() {
  const releases = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1,
    tag_name: `r${index + 1}`,
    draft: false,
    published_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  }))

  releases.push({
    id: 13,
    tag_name: 'draft-newest',
    draft: true,
    published_at: '2026-01-13T00:00:00Z',
  })
  return releases
}

test('selects non-draft releases older than the newest ten', () => {
  const selected = selectOldReleases(releaseFixture(), 10)
  assert.deepEqual(selected.map(({ tag_name }) => tag_name), ['r2', 'r1'])
})

test('deletes each selected release before its tag', async () => {
  const calls = []
  const listReleases = Symbol('listReleases')
  const github = {
    paginate: async (method, options) => {
      assert.equal(method, listReleases)
      assert.deepEqual(options, { owner: 'sagehou', repo: '360T7-ImmortalWrt', per_page: 100 })
      return releaseFixture()
    },
    rest: {
      repos: {
        listReleases,
        deleteRelease: async ({ release_id }) => calls.push(['release', release_id]),
      },
      git: {
        deleteRef: async ({ ref }) => calls.push(['tag', ref]),
      },
    },
  }

  await cleanupReleases({
    github,
    context: { repo: { owner: 'sagehou', repo: '360T7-ImmortalWrt' } },
    core: { info: () => {} },
  })

  assert.deepEqual(calls, [
    ['release', 2],
    ['tag', 'tags/r2'],
    ['release', 1],
    ['tag', 'tags/r1'],
  ])
})
```

- [ ] **Step 2: Run the test and verify the expected failure**

```bash
node --test .github/scripts/delete-old-releases.test.js
```

Expected: FAIL with `Cannot find module './delete-old-releases'`.

- [ ] **Step 3: Implement the smallest production module**

Create `.github/scripts/delete-old-releases.js`:

```js
const DEFAULT_KEEP_LATEST = 10

function selectOldReleases(releases, keepLatest = DEFAULT_KEEP_LATEST) {
  return releases
    .filter(({ draft }) => !draft)
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(keepLatest)
}

async function cleanupReleases({
  github,
  context,
  core,
  keepLatest = DEFAULT_KEEP_LATEST,
}) {
  const releases = await github.paginate(github.rest.repos.listReleases, {
    ...context.repo,
    per_page: 100,
  })
  const oldReleases = selectOldReleases(releases, keepLatest)

  if (oldReleases.length === 0) {
    core.info('No old Releases to delete')
    return
  }

  for (const release of oldReleases) {
    core.info(`Deleting Release ${release.tag_name} (${release.id})`)
    await github.rest.repos.deleteRelease({
      ...context.repo,
      release_id: release.id,
    })
    await github.rest.git.deleteRef({
      ...context.repo,
      ref: `tags/${release.tag_name}`,
    })
  }
}

module.exports = cleanupReleases
module.exports.selectOldReleases = selectOldReleases
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
node --test .github/scripts/delete-old-releases.test.js
```

Expected: 2 tests, 2 passes, 0 failures.

- [ ] **Step 5: Check and commit the module**

```bash
git diff --check -- .github/scripts
git add .github/scripts/delete-old-releases.js .github/scripts/delete-old-releases.test.js
git commit -m "ci: add tested Release cleanup"
```

### Task 2: Invoke the cleanup module from the workflow

**Files:**
- Modify: `.github/workflows/build-openwrt.yml:200-207`
- Verify: `.github/scripts/delete-old-releases.js`

**Interfaces:**
- Consumes: the module from Task 1 and `${{ secrets.GITHUB_TOKEN }}`.
- Produces: the existing conditional cleanup step running under official Node 24.

- [ ] **Step 1: Run the desired-state assertion before editing**

```bash
node <<'NODE'
const fs = require('fs')
const workflow = fs.readFileSync('.github/workflows/build-openwrt.yml', 'utf8')
for (const expected of [
  'uses: actions/github-script@v9.0.0',
  "github-token: ${{ secrets.GITHUB_TOKEN }}",
  "require('./.github/scripts/delete-old-releases')",
  'await cleanupReleases({ github, context, core })',
]) {
  if (!workflow.includes(expected)) throw new Error(`missing: ${expected}`)
}
if (workflow.includes('dev-drprasad/delete-older-releases')) {
  throw new Error('Node 20 cleanup Action is still referenced')
}
NODE
```

Expected: FAIL with `missing: uses: actions/github-script@v9.0.0`.

- [ ] **Step 2: Replace the archived Action step**

Use this exact workflow block:

```yaml
    - name: Remove old Releases
      uses: actions/github-script@v9.0.0
      if: env.UPLOAD_RELEASE == 'true' && !cancelled()
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
        script: |
          const cleanupReleases = require('./.github/scripts/delete-old-releases')
          await cleanupReleases({ github, context, core })
```

- [ ] **Step 3: Re-run the desired-state assertion**

Run the Step 1 Node.js command again.

Expected: PASS with exit code 0 and no output.

- [ ] **Step 4: Run tests and workflow lint**

```bash
node --test .github/scripts/delete-old-releases.test.js
ACTIONLINT_DIR="$(mktemp -d /tmp/actionlint-node24.XXXXXX)"
curl -fsSL 'https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz' | tar -xz -C "$ACTIONLINT_DIR" actionlint
"$ACTIONLINT_DIR/actionlint" .github/workflows/build-openwrt.yml .github/workflows/update-checker.yml
```

Expected: 2 tests pass and actionlint exits 0 without diagnostics.

- [ ] **Step 5: Commit the workflow change**

```bash
git diff --check -- .github/workflows/build-openwrt.yml
git add .github/workflows/build-openwrt.yml
git commit -m "ci: run Release cleanup on Node 24"
```

### Task 3: Verify no workflow Action uses Node 20

**Files:**
- Verify: `.github/workflows/build-openwrt.yml`
- Verify: `.github/workflows/update-checker.yml`
- Verify: `.github/scripts/delete-old-releases.js`
- Verify: `.github/scripts/delete-old-releases.test.js`

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: final evidence for behavior, syntax, upstream versions, runtime declarations, and repository cleanliness.

- [ ] **Step 1: Verify the official Action tag and runtime**

```bash
git ls-remote --exit-code https://github.com/actions/github-script.git refs/tags/v9.0.0
curl -fsSL https://raw.githubusercontent.com/actions/github-script/v9.0.0/action.yml | rg "using: ['\"]?node24"
```

Expected: the tag resolves and the manifest reports `using: node24`.

- [ ] **Step 2: Check every referenced Action manifest for Node 20**

```bash
set -euo pipefail
while read -r manifest; do
  if curl -fsSL "$manifest" | rg -q "using: ['\"]?node20"; then
    echo "Node 20 Action found: $manifest" >&2
    exit 1
  fi
done <<'EOF'
https://raw.githubusercontent.com/actions/checkout/v7.0.1/action.yml
https://raw.githubusercontent.com/jlumbroso/free-disk-space/v1.3.1/action.yml
https://raw.githubusercontent.com/owenthereal/action-upterm/v1.15.0/action.yml
https://raw.githubusercontent.com/actions/upload-artifact/v7.0.1/action.yml
https://raw.githubusercontent.com/softprops/action-gh-release/v3.0.2/action.yml
https://raw.githubusercontent.com/Mattraks/delete-workflow-runs/v2.1.0/action.yaml
https://raw.githubusercontent.com/actions/cache/v6.1.0/action.yml
https://raw.githubusercontent.com/peter-evans/repository-dispatch/v4.0.1/action.yml
https://raw.githubusercontent.com/actions/github-script/v9.0.0/action.yml
EOF
```

Expected: exit code 0 and no `Node 20 Action found` message.

- [ ] **Step 3: Run the complete local verification**

```bash
set -euo pipefail
node --test .github/scripts/delete-old-releases.test.js
git diff --check origin/main..HEAD
test -z "$(git status --porcelain=v1)"
git status --short --branch
git log --oneline --decorate origin/main..HEAD
```

Expected: all tests pass, no whitespace errors, and a clean worktree containing only the approved local commits ahead of `origin/main`.
