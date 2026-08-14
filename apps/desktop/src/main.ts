/** Electron application shell for the DeepSeek Harness Web profile. */

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  app, BrowserWindow, dialog, Menu, nativeTheme, shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { HarnessProcess, resolveDesktopCwd } from './harness-process.ts'
import { isExternalWebUrl, isHarnessNavigation } from './navigation.ts'

const appRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const loadingPage = join(appRoot, 'assets', 'loading.html')
const desktopPatch = join(appRoot, 'desktop.cordis.yml')
const DESKTOP_APP_NAME = 'DeepSeek Harness App'
let mainWindow: BrowserWindow | undefined
let harnessUrl: string | undefined
let quitAfterShutdown = false

app.setName(DESKTOP_APP_NAME)

const harness = new HarnessProcess({
  executable: app.isPackaged ? process.execPath : 'pnpm',
  ...(app.isPackaged ? { runAsNode: true } : { commandPrefix: ['--dir', repoRoot, 'dsh'] }),
  cwd: resolveDesktopCwd(),
  patchFiles: [desktopPatch],
})

if (process.env.DSH_DESKTOP_DEBUG !== undefined) console.error('desktop: main module loaded')

function installMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 920,
    minHeight: 640,
    title: DESKTOP_APP_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111318' : '#f7f8fa',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (harnessUrl !== undefined && isHarnessNavigation(url, harnessUrl)) return { action: 'allow' }
    if (isExternalWebUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (harnessUrl === undefined || isHarnessNavigation(url, harnessUrl)) return
    event.preventDefault()
    if (isExternalWebUrl(url)) void shell.openExternal(url)
  })
  window.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(DESKTOP_APP_NAME)
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  return window
}

async function showApplication(): Promise<void> {
  installMenu()
  mainWindow = createWindow()
  await mainWindow.loadFile(loadingPage)
  harnessUrl = await harness.start()
  await mainWindow.loadURL(harnessUrl)
}

app.on('before-quit', (event) => {
  if (quitAfterShutdown) return
  event.preventDefault()
  quitAfterShutdown = true
  void harness.stop().finally(() => { app.quit() })
})

app.on('activate', () => {
  if (mainWindow !== undefined) return
  if (harnessUrl === undefined) {
    void showApplication().catch(reportStartupFailure)
    return
  }
  mainWindow = createWindow()
  void mainWindow.loadURL(harnessUrl)
})

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox(`${DESKTOP_APP_NAME} could not start`, message)
  app.quit()
}

void app.whenReady().then(async () => {
  if (process.env.DSH_DESKTOP_DEBUG !== undefined) console.error('desktop: Electron ready')
  if (process.platform !== 'darwin') {
    reportStartupFailure(new Error('This desktop distribution currently supports macOS only.'))
    return
  }
  await showApplication().catch(reportStartupFailure)
})
