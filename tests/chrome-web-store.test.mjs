import test from 'node:test'
import assert from 'node:assert/strict'

import {
  readChromeWebStoreConfig,
  uploadAndPublishChromeExtension,
} from '../scripts/chrome-web-store.mjs'

const validConfig = {
  accessToken: 'test-token',
  publisherId: 'publisher-123',
  extensionId: 'abcdefghijklmnopabcdefghijklmnop',
  publishType: 'STAGED_PUBLISH',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('requires valid store identifiers and a short-lived access token', () => {
  assert.throws(() => readChromeWebStoreConfig({}), /ACCESS_TOKEN/)
  assert.throws(
    () =>
      readChromeWebStoreConfig({
        CWS_ACCESS_TOKEN: 'token',
        CWS_PUBLISHER_ID: 'publisher',
        CWS_EXTENSION_ID: 'not-an-extension-id',
      }),
    /32-character/,
  )
})

test('uploads a zip and submits it as a staged publish', async () => {
  const calls = []
  const responses = [
    jsonResponse({ uploadState: 'SUCCEEDED', crxVersion: '0.2.0' }),
    jsonResponse({ state: 'PENDING_REVIEW', itemId: validConfig.extensionId }),
  ]
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return responses.shift()
  }

  const result = await uploadAndPublishChromeExtension(
    validConfig,
    Buffer.from('zip'),
    { fetchImpl },
  )

  assert.equal(result.upload.uploadState, 'SUCCEEDED')
  assert.equal(result.published.state, 'PENDING_REVIEW')
  assert.equal(calls.length, 2)
  assert.match(calls[0].url, /\/upload\/v2\/publishers\/publisher-123/)
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    publishType: 'STAGED_PUBLISH',
    blockOnWarnings: true,
  })
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token')
})

test('polls an asynchronous upload before publishing', async () => {
  const calls = []
  let sleeps = 0
  const responses = [
    jsonResponse({ uploadState: 'IN_PROGRESS' }),
    jsonResponse({ lastAsyncUploadState: 'IN_PROGRESS' }),
    jsonResponse({ lastAsyncUploadState: 'SUCCEEDED' }),
    jsonResponse({ state: 'PENDING_REVIEW', itemId: validConfig.extensionId }),
  ]

  const result = await uploadAndPublishChromeExtension(
    validConfig,
    Buffer.from('zip'),
    {
      fetchImpl: async (url, options) => {
        calls.push({ url, options })
        return responses.shift()
      },
      sleep: async () => {
        sleeps += 1
      },
      pollIntervalMs: 0,
    },
  )

  assert.equal(result.upload.uploadState, 'SUCCEEDED')
  assert.equal(sleeps, 2)
  assert.equal(calls.length, 4)
  assert.match(calls[1].url, /:fetchStatus$/)
  assert.match(calls[3].url, /:publish$/)
})

test('does not publish when the package upload fails', async () => {
  let requests = 0

  await assert.rejects(
    uploadAndPublishChromeExtension(validConfig, Buffer.from('zip'), {
      fetchImpl: async () => {
        requests += 1
        return jsonResponse({ uploadState: 'FAILED' })
      },
    }),
    /did not succeed: FAILED/,
  )

  assert.equal(requests, 1)
})
