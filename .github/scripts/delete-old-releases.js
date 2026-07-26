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
