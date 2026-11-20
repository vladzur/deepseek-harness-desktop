'use strict'

const {
  app,
  BrowserWindow,
  Menu,
  shell,
  session,
  nativeImage,
  dialog,
  Notification,
  screen,
} = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

const APP_NAME = 'DeepSeek Harness'
const APP_ID = 'deepseek-harness'
const sessionDir = process.env.DSH_DESKTOP_SESSION_DIR || ''
const runtimeDir = process.env.DSH_DESKTOP_RUNTIME || ''
const sessionId = process.env.DSH_DESKTOP_SESSION_ID || String(process.pid)
const logDir = process.env.DSH_DESKTOP_LOG_DIR || sessionDir
const serverLog = process.env.DSH_DESKTOP_SERVER_LOG || path.join(logDir, 'server.log')
const electronLog = process.env.DSH_DESKTOP_ELECTRON_LOG || path.join(logDir, 'electron.log')
const currentFile = path.join(runtimeDir, 'current')
const appDir = __dirname
const iconPath = process.env.DSH_DESKTOP_ICON || path.join(appDir, 'icon.png')
const workspace = process.env.DSH_DESKTOP_WORKSPACE || process.env.HOME || process.cwd()
const startTimeout = Math.max(15, Number(process.env.DSH_DESKTOP_START_TIMEOUT || '180')) * 1000
const debug = process.env.DSH_DESKTOP_DEBUG === '1'

let win = null
let server = null
let authUrl = ''
let appOrigin = ''
let quitting = false
let ready = false
let startTimer = null
let serverExitHandled = false
let devtoolsOpened = false

function log(message) {
  try {
    fs.appendFileSync(electronLog, `[${new Date().toISOString()}] ${message}\n`)
  } catch {}
}

function redact(value) {
  return String(value).replace(/([?&]token=)[^&\s"'<>]+/gi, '$1REDACTED')
}

function appendServerLog(text) {
  if (!text) return
  const line = redact(String(text))
  try {
    fs.appendFileSync(serverLog, line.endsWith('\n') ? line : line + '\n')
  } catch {}
}

function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, file)
    try { fs.chmodSync(file, 0o600) } catch {}
  } catch (error) {
    log('no se pudo escribir ' + file + ': ' + error.message)
  }
}

function writeText(file, value) {
  try {
    fs.writeFileSync(file, value, { mode: 0o600 })
    try { fs.chmodSync(file, 0o600) } catch {}
  } catch (error) {
    log('no se pudo escribir ' + file + ': ' + error.message)
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function processCmdline(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ')
  } catch {
    return ''
  }
}

function killGroup(pid, signal) {
  if (!pid) return
  try {
    process.kill(-pid, signal)
    return
  } catch {}
  try {
    process.kill(pid, signal)
  } catch {}
}

function isLoopbackUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]'
  } catch {
    return false
  }
}

function isAppUrl(value) {
  try {
    const parsed = new URL(value)
    if (appOrigin) return parsed.origin === appOrigin
    return parsed.protocol === 'file:'
  } catch {
    return false
  }
}

function openExternal(value) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(value)
    }
  } catch {}
}

function uniquePath(dir, filename) {
  const safe = path.basename(filename || 'descarga')
  let candidate = path.join(dir, safe)
  let index = 1
  while (fs.existsSync(candidate)) {
    const extension = path.extname(safe)
    const base = path.basename(safe, extension)
    candidate = path.join(dir, `${base} (${index})${extension}`)
    index += 1
  }
  return candidate
}

function defaultWebPreferences() {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
    plugins: true,
    spellcheck: true,
    partition: 'persist:' + APP_ID,
  }
}

function windowOptions() {
  const options = {
    ...loadBounds(),
    show: false,
    title: APP_NAME,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    webPreferences: defaultWebPreferences(),
  }
  try {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) options.icon = image
  } catch {}
  return options
}

function childWindowOptions() {
  const options = {
    width: 1100,
    height: 760,
    autoHideMenuBar: true,
    title: APP_NAME,
    webPreferences: defaultWebPreferences(),
  }
  try {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) options.icon = image
  } catch {}
  return options
}

function boundsFile() {
  return path.join(app.getPath('userData'), 'window.json')
}

function loadBounds() {
  try {
    const value = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'))
    if (
      Number.isFinite(value.width) &&
      Number.isFinite(value.height) &&
      value.width >= 820 &&
      value.height >= 560
    ) {
      if (Number.isFinite(value.x) && Number.isFinite(value.y)) {
        const visible = screen.getAllDisplays().some((display) => {
          const area = display.workArea
          return (
            value.x < area.x + area.width &&
            value.x + value.width > area.x &&
            value.y < area.y + area.height &&
            value.y + value.height > area.y
          )
        })
        if (visible) return { x: value.x, y: value.y, width: value.width, height: value.height }
      }
      return { width: Math.round(value.width), height: Math.round(value.height) }
    }
  } catch {}
  return { width: 1280, height: 840 }
}

function saveBounds() {
  if (!win || win.isDestroyed()) return
  try {
    writeText(boundsFile(), JSON.stringify(win.getBounds()))
  } catch {}
}

function configureSession(browserSession) {
  const allowed = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'notifications',
    'fullscreen',
  ])
  browserSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details && details.requestingUrl ? details.requestingUrl : webContents.getURL()
    callback(allowed.has(permission) && isLoopbackUrl(requestingUrl))
  })
  try {
    browserSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
      return allowed.has(permission) && isLoopbackUrl(requestingOrigin)
    })
  } catch {}
  browserSession.on('will-download', (event, item) => {
    try {
      const directory = app.getPath('downloads')
      item.setSavePath(uniquePath(directory, item.getFilename()))
      item.once('done', (doneEvent, state) => {
        if (state === 'completed' && Notification.isSupported()) {
          new Notification({
            title: 'Descarga completada',
            body: path.basename(item.getSavePath()),
          }).show()
        }
      })
    } catch (error) {
      log('descarga: ' + error.message)
    }
  })
}

function buildMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { role: 'close', label: 'Cerrar ventana' },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forceReload', label: 'Forzar recarga' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Acercar' },
        { role: 'zoomOut', label: 'Alejar' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Abrir carpeta de registros',
          click: () => {
            try { shell.showItemInFolder(serverLog) } catch {}
          },
        },
        {
          label: 'Acerca de DeepSeek Harness',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: APP_NAME,
              message: APP_NAME,
              detail: [
                'Carcasa de escritorio: ' + (process.env.DSH_DESKTOP_VERSION || 'desconocida'),
                'Electron: ' + process.versions.electron,
                'Chromium: ' + process.versions.chrome,
                'Origen: ' + (appOrigin || 'iniciando'),
                'Workspace: ' + workspace,
              ].join('\n'),
            }).catch(() => {})
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  win = new BrowserWindow(windowOptions())
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => {
    if (quitting) return
    win.show()
    win.focus()
  })
  win.on('close', saveBounds)
  win.on('closed', () => {
    win = null
  })
  win.webContents.on('did-get-response-details', (event, status, newURL, originalURL, httpResponseCode, requestMethod, referrer, headers, resourceType) => {
    if (resourceType === 'mainFrame' && httpResponseCode === 401 && authUrl && !quitting) {
      log('respuesta 401; recargando la URL autenticada')
      setTimeout(() => {
        if (win && !win.isDestroyed()) win.loadURL(authUrl).catch(() => {})
      }, 150)
    }
  })
  win.webContents.on('render-process-gone', (event, details) => {
    log('renderer terminado: ' + JSON.stringify(details))
    if (quitting) return
    dialog.showErrorBox(APP_NAME, 'La interfaz se cerró inesperadamente. Se recargará.')
    if (win && !win.isDestroyed()) win.reload()
  })
  win.webContents.on('page-title-updated', (event, title) => {
    if (title && win && !win.isDestroyed()) win.setTitle(title)
  })
  win.webContents.on('did-finish-load', () => {
    if (debug && !devtoolsOpened && win && !win.isDestroyed()) {
      devtoolsOpened = true
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })
  win.webContents.on('did-fail-load', (event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && !quitting) {
      log(`did-fail-load ${code} ${description} ${redact(validatedURL)}`)
    }
  })
  win.loadFile(path.join(appDir, 'splash.html')).catch((error) => {
    log('no se pudo cargar el splash: ' + error.message)
  })
}

function writeSessionFiles() {
  if (!sessionDir) return
  const state = {
    session: sessionId,
    pid: process.pid,
    launcherPid: Number(process.env.DSH_DESKTOP_LAUNCHER_PID || 0),
    serverPid: server ? server.pid : 0,
    origin: appOrigin,
    workspace,
    dshHome: process.env.DSH_HOME || '',
    startedAt: new Date().toISOString(),
    version: process.env.DSH_DESKTOP_VERSION || '',
  }
  writeJson(path.join(sessionDir, 'state.json'), state)
  if (server) writeText(path.join(sessionDir, 'server.pid'), String(server.pid))
  writeText(path.join(sessionDir, 'electron.pid'), String(process.pid))
  try {
    const tmp = path.join(runtimeDir, '.current.tmp')
    fs.writeFileSync(tmp, sessionId, { mode: 0o600 })
    fs.renameSync(tmp, currentFile)
    try { fs.chmodSync(currentFile, 0o600) } catch {}
  } catch (error) {
    log('no se pudo publicar current: ' + error.message)
  }
}

function loadApp() {
  if (!win || win.isDestroyed() || !authUrl) return
  ready = true
  win.loadURL(authUrl).catch((error) => {
    failStartup('No se pudo cargar la interfaz: ' + error.message)
  })
}

function stopServer(graceMs) {
  const child = server
  if (!child) return Promise.resolve()
  server = null
  const pid = child.pid
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    child.once('exit', finish)
    killGroup(pid, 'SIGTERM')
    setTimeout(() => {
      if (settled) return
      killGroup(pid, 'SIGKILL')
      setTimeout(finish, 500)
    }, graceMs || 8000)
    setTimeout(finish, (graceMs || 8000) + 2500)
  })
}

function failStartup(message) {
  if (quitting) return
  quitting = true
  if (startTimer) {
    clearTimeout(startTimer)
    startTimer = null
  }
  log('fallo de arranque: ' + message)
  stopServer(3000).finally(() => {
    dialog.showErrorBox(
      'No se pudo iniciar DeepSeek Harness',
      `${message}\n\nRegistro del servidor: ${serverLog}`,
    )
    app.exit(1)
  })
}

function startServer() {
  let command
  try {
    command = JSON.parse(process.env.DSH_DESKTOP_SERVER_CMD || '[]')
  } catch (error) {
    failStartup('El comando del servidor no es válido: ' + error.message)
    return
  }
  if (!Array.isArray(command) || command.length === 0) {
    failStartup('El comando del servidor no está configurado.')
    return
  }
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('ELECTRON_') || key.startsWith('DSH_DESKTOP_')) delete env[key]
  }
  if (!env.DSH_HOME) delete env.DSH_HOME
  try {
    server = spawn(command[0], command.slice(1), {
      cwd: workspace,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    failStartup('No se pudo lanzar el servidor: ' + error.message)
    return
  }
  writeSessionFiles()
  const lines = readline.createInterface({ input: server.stdout })
  lines.on('line', (line) => {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '')
    appendServerLog(clean)
    const match = clean.match(/dsh web:\s+(https?:\/\/\S+)/)
    if (match && !authUrl) {
      authUrl = match[1]
      try { appOrigin = new URL(authUrl).origin } catch { appOrigin = '' }
      writeSessionFiles()
      if (startTimer) {
        clearTimeout(startTimer)
        startTimer = null
      }
      loadApp()
    }
  })
  server.stderr.setEncoding('utf8')
  server.stderr.on('data', (chunk) => appendServerLog(chunk.toString()))
  server.on('error', (error) => {
    failStartup('No se pudo lanzar el servidor: ' + error.message)
  })
  server.on('exit', (code, signal) => {
    appendServerLog(`[servidor terminado code=${code} signal=${signal}]`)
    const wasReady = ready
    server = null
    if (quitting) return
    if (!wasReady) {
      failStartup(`El servidor terminó antes de estar listo (código ${code === null ? signal : code}).`)
    } else if (!serverExitHandled) {
      serverExitHandled = true
      dialog.showErrorBox(APP_NAME, 'El servidor de DeepSeek Harness se detuvo. Vuelve a abrir la aplicación.')
      app.quit()
    }
  })
  startTimer = setTimeout(() => {
    failStartup('El servidor no respondió a tiempo. Revisa el registro del servidor.')
  }, startTimeout)
}

function cleanupFiles() {
  try {
    if (fs.readFileSync(currentFile, 'utf8').trim() === sessionId) fs.unlinkSync(currentFile)
  } catch {}
  try { fs.rmSync(sessionDir, { recursive: true, force: true }) } catch {}
}

function cleanupStaleSession() {
  if (!runtimeDir) return
  let staleId = ''
  try {
    staleId = fs.readFileSync(currentFile, 'utf8').trim()
  } catch {
    return
  }
  if (!staleId || staleId === sessionId) return
  const staleDir = path.join(runtimeDir, 'sessions', staleId)
  let stalePid = 0
  let staleElectronPid = 0
  try {
    stalePid = Number(fs.readFileSync(path.join(staleDir, 'server.pid'), 'utf8'))
  } catch {}
  try {
    staleElectronPid = Number(fs.readFileSync(path.join(staleDir, 'electron.pid'), 'utf8'))
  } catch {}
  if (isAlive(staleElectronPid) && /electron/.test(processCmdline(staleElectronPid))) {
    log('otra instancia sigue viva; se conserva su estado')
    return
  }
  if (isAlive(stalePid) && /dsh|@deepseek-ai\/dsh/.test(processCmdline(stalePid))) {
    log(`limpiando servidor huérfano ${stalePid}`)
    killGroup(stalePid, 'SIGTERM')
    setTimeout(() => {
      if (isAlive(stalePid)) killGroup(stalePid, 'SIGKILL')
    }, 2500)
  }
  try { fs.rmSync(staleDir, { recursive: true, force: true }) } catch {}
  try {
    if (fs.readFileSync(currentFile, 'utf8').trim() === staleId) fs.unlinkSync(currentFile)
  } catch {}
}

app.setName(APP_NAME)
try { app.setDesktopName(APP_ID + '.desktop') } catch {}
const userData = process.env.DSH_DESKTOP_USER_DATA ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config'), 'deepseek-harness', 'electron')
try {
  fs.mkdirSync(userData, { recursive: true, mode: 0o700 })
  app.setPath('userData', userData)
} catch (error) {
  log('no se pudo configurar userData: ' + error.message)
}

app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (attachEvent) => attachEvent.preventDefault())
  contents.on('will-navigate', (navigationEvent, url) => {
    if (!isAppUrl(url)) {
      navigationEvent.preventDefault()
      openExternal(url)
    }
  })
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: childWindowOptions() }
    }
    openExternal(url)
    return { action: 'deny' }
  })
})

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting) {
      cleanupFiles()
      return
    }
    event.preventDefault()
    quitting = true
    if (startTimer) {
      clearTimeout(startTimer)
      startTimer = null
    }
    stopServer(8000).finally(() => {
      cleanupFiles()
      app.quit()
    })
  })

  app.on('will-quit', () => cleanupFiles())

  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => {
      quitting = true
      if (startTimer) {
        clearTimeout(startTimer)
        startTimer = null
      }
      stopServer(3000).finally(() => {
        cleanupFiles()
        app.exit(0)
      })
    })
  }

  app.whenReady()
    .then(() => {
      configureSession(session.fromPartition('persist:' + APP_ID))
      cleanupStaleSession()
      buildMenu()
      createWindow()
      startServer()
    })
    .catch((error) => {
      log('whenReady: ' + error.message)
      dialog.showErrorBox(APP_NAME, 'Error al iniciar la aplicación: ' + error.message)
      app.exit(1)
    })
}
