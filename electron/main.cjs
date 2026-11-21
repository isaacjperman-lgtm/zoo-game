// Desktop launcher: shows the built game (dist/) in a window. All game code runs unchanged from the web build.
const { app, BrowserWindow, Menu, shell, session } = require('electron')
const fs = require('fs')
const path = require('path')

// Only one copy at a time (two would fight over the same save).
if (!app.requestSingleInstanceLock()) app.quit()

// Make WebGL work on more machines, and avoid launch failures on Linux systems that restrict the sandbox
// (the game only ever loads its own bundled files).
app.commandLine.appendSwitch('ignore-gpu-blocklist')
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox')
if (process.platform === 'linux') {
  // Raspberry Pi and other small ARM boards: use the GPU for drawing and rasterizing, and don't let Chromium
  // fall back to software rendering. `--quality=low|high` on the command line overrides the automatic choice.
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('disable-frame-rate-limit') // the game has its own cap on slow machines
  if (process.arch === 'arm64' || process.arch === 'arm') app.commandLine.appendSwitch('use-gl', 'egl')
}
const qArg = process.argv.find((a) => a.startsWith('--quality='))

Menu.setApplicationMenu(null)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Zoo Keeper',
    backgroundColor: '#0c110f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, backgroundThrottling: false },
  })
  win.once('ready-to-show', () => win.show())
  const q = qArg && qArg.split('=')[1]
  win.loadFile(
    path.join(__dirname, '..', 'dist', 'index.html'),
    q === 'low' || q === 'high' ? { query: { quality: q } } : undefined,
  )

  // anything that isn't the game itself opens in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
  // F11 toggles full screen
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      e.preventDefault()
    }
  })
}

// Photos taken in the game are saved straight to Pictures/Zoo Keeper instead of asking where to put each one.
function setupPhotoSaving() {
  session.defaultSession.on('will-download', (_event, item) => {
    const dir = path.join(app.getPath('pictures'), 'Zoo Keeper')
    fs.mkdirSync(dir, { recursive: true })
    const { name, ext } = path.parse(item.getFilename())
    let target = path.join(dir, name + ext)
    for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${name} (${i})${ext}`)
    item.setSavePath(target)
  })
}

app.whenReady().then(() => {
  setupPhotoSaving()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
app.on('window-all-closed', () => app.quit())
