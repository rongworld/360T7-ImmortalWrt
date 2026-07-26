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
      assert.deepEqual(options, {
        owner: 'sagehou',
        repo: '360T7-ImmortalWrt',
        per_page: 100,
      })
      return releaseFixture()
    },
    rest: {
      repos: {
        listReleases,
        deleteRelease: async ({ release_id }) =>
          calls.push(['release', release_id]),
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
