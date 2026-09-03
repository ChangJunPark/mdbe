import storage from '@/core/storage'
import commands from '@/core/commands'
import {
  UPDATE_AVAILABLE_ACTION,
  UPDATE_READY_STORAGE_KEY,
  type ExtensionUpdateInfo,
} from '@/core/extension-update'

chrome.runtime.onMessage.addListener(({ action, data }, sender, callback) => {
  if (action !== 'storage' && action !== 'fetch') return false
  void messageHandler(action, data, sender, callback)
  return true
})

async function messageHandler(
  action: string,
  data: any,
  sender: chrome.runtime.MessageSender,
  callback?: (response?: any) => void,
) {
  switch (action) {
    case 'storage':
      await storage.set({ [data.key]: data.value })
      updatePage(data.key, data.value)
      callback?.(data)
      break
    case 'fetch':
      fetchData(sender.url).then(callback)
      break
  }
}

async function fetchData(url?: string) {
  if (!url) {
    const error = new Error('Fetch error: URL is undefined.')
    console.error(error)
    return error.message
  }

  return fetch(url)
    .then(res => res.text())
    .catch(err => {
      console.error(err)
      return err.message
    })
}

chrome.runtime.onUpdateAvailable.addListener(({ version }) => {
  const update: ExtensionUpdateInfo = {
    version,
    detectedAt: Date.now(),
  }

  chrome.storage.local.set({ [UPDATE_READY_STORAGE_KEY]: update }, () => {
    void chrome.runtime.lastError
  })
  chrome.runtime.sendMessage(
    { action: UPDATE_AVAILABLE_ACTION, data: update },
    () => {
      void chrome.runtime.lastError
    },
  )
})

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== 'update') return
  chrome.storage.local.remove(UPDATE_READY_STORAGE_KEY, () => {
    void chrome.runtime.lastError
  })
})

// Chrome extension shortcuts
chrome.commands.onCommand.addListener(action => {
  commands[action]?.(messageHandler)
})

const actionMap = {
  enable: 'reload',
  refresh: 'toggleRefresh',
  centered: 'toggleCentered',
  mdPlugins: 'updateMdPlugins',
  pageTheme: 'updatePageTheme',
  hiddenSide: 'toggleSide',
}

function updatePage(key: keyof typeof actionMap, value?: any) {
  const action = actionMap[key]
  action &&
    chrome.tabs.query({ currentWindow: true, active: true }, tabs => {
      tabs.length &&
        chrome.tabs.sendMessage(tabs[0].id, { action, data: { key, value } })
    })
}

chrome.runtime.setUninstallURL('https://github.com/ChangJunPark/mdbe/issues')
