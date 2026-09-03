import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const API_ORIGIN = 'https://chromewebstore.googleapis.com'
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const PUBLISHER_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const PUBLISH_TYPES = new Set(['DEFAULT_PUBLISH', 'STAGED_PUBLISH'])
const SUCCESS_STATES = new Set(['SUCCEEDED', 'SUCCESS'])
const PENDING_STATES = new Set(['IN_PROGRESS', 'UPLOAD_IN_PROGRESS'])

export function readChromeWebStoreConfig(environment = process.env) {
  const config = {
    accessToken: environment.CWS_ACCESS_TOKEN || '',
    publisherId: environment.CWS_PUBLISHER_ID || '',
    extensionId: environment.CWS_EXTENSION_ID || '',
    publishType: environment.CWS_PUBLISH_TYPE || 'STAGED_PUBLISH',
  }

  if (!config.accessToken) throw new Error('CWS_ACCESS_TOKEN is required')
  if (!PUBLISHER_ID_PATTERN.test(config.publisherId)) {
    throw new Error('CWS_PUBLISHER_ID is missing or invalid')
  }
  if (!EXTENSION_ID_PATTERN.test(config.extensionId)) {
    throw new Error('CWS_EXTENSION_ID must be a 32-character Chrome item ID')
  }
  if (!PUBLISH_TYPES.has(config.publishType)) {
    throw new Error(
      'CWS_PUBLISH_TYPE must be DEFAULT_PUBLISH or STAGED_PUBLISH',
    )
  }

  return config
}

async function requestJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options)
  const text = await response.text()
  let body = null

  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text }
    }
  }

  if (!response.ok) {
    throw new Error(
      `Chrome Web Store API ${response.status}: ${JSON.stringify(body)}`,
    )
  }

  return body || {}
}

export async function uploadAndPublishChromeExtension(
  config,
  packageBytes,
  {
    fetchImpl = fetch,
    sleep = milliseconds =>
      new Promise(resolve => setTimeout(resolve, milliseconds)),
    pollIntervalMs = 5000,
    maxPollAttempts = 120,
  } = {},
) {
  const itemName = `publishers/${encodeURIComponent(
    config.publisherId,
  )}/items/${encodeURIComponent(config.extensionId)}`
  const authorization = `Bearer ${config.accessToken}`
  const uploadUrl = `${API_ORIGIN}/upload/v2/${itemName}:upload`
  const statusUrl = `${API_ORIGIN}/v2/${itemName}:fetchStatus`
  const publishUrl = `${API_ORIGIN}/v2/${itemName}:publish`

  const upload = await requestJson(fetchImpl, uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/zip',
    },
    body: packageBytes,
  })

  let uploadState = upload.uploadState
  for (
    let attempt = 0;
    PENDING_STATES.has(uploadState) && attempt < maxPollAttempts;
    attempt += 1
  ) {
    await sleep(pollIntervalMs)
    const status = await requestJson(fetchImpl, statusUrl, {
      method: 'GET',
      headers: { Authorization: authorization },
    })
    uploadState = status.lastAsyncUploadState
  }

  if (!SUCCESS_STATES.has(uploadState)) {
    throw new Error(`Chrome Web Store upload did not succeed: ${uploadState}`)
  }

  const published = await requestJson(fetchImpl, publishUrl, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publishType: config.publishType,
      blockOnWarnings: true,
    }),
  })

  return {
    upload: { ...upload, uploadState },
    published,
  }
}

async function main() {
  const config = readChromeWebStoreConfig()
  const packagePath = process.argv[2]
  if (!packagePath) {
    throw new Error('Usage: node scripts/chrome-web-store.mjs <extension.zip>')
  }

  const packageBytes = await fs.readFile(packagePath)
  const result = await uploadAndPublishChromeExtension(config, packageBytes)
  console.log(
    JSON.stringify(
      {
        uploadState: result.upload.uploadState,
        submissionState: result.published.state,
        itemId: result.published.itemId,
        publishType: config.publishType,
      },
      null,
      2,
    ),
  )
}

const entryPoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : ''

if (entryPoint === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
