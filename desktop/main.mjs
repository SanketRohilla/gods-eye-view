import { app, BrowserWindow, Menu, shell, session } from 'electron';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Hardware WebGL2 acceleration for Linux and Windows
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'Vulkan,VaapiVideoDecoder');
}

let viteServer = null;
let mainWindow = null;

function getFreeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function startLocalGevServer() {
  const port = await getFreeLoopbackPort();
  process.env.HOST = '127.0.0.1';
  process.env.PORT = String(port);

  viteServer = await createServer({
    root: ROOT_DIR,
    configFile: path.join(ROOT_DIR, 'vite.config.js'),
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
    },
  });

  await viteServer.listen();
  return `http://127.0.0.1:${port}`;
}

function buildDesktopMenu() {
  const template = [
    {
      label: "God's Eye View",
      submenu: [
        {
          label: 'Reload Console',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Tactical Controls',
      submenu: [
        {
          label: 'Toggle HUD (H)',
          click: () => mainWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'H' }),
        },
        {
          label: 'Toggle Detection Overlay (D)',
          click: () => mainWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'D' }),
        },
        {
          label: 'Toggle Cockpit View (C)',
          click: () => mainWindow?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'C' }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow() {
  const allowedPermissions = new Set(['media', 'usb', 'hid', 'geolocation']);

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });

  const serverUrl = await startLocalGevServer();

  mainWindow = new BrowserWindow({
    title: "God's Eye View — Spatial Intelligence Console",
    width: 1600,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#05070a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  buildDesktopMenu();
  await mainWindow.loadURL(serverUrl);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', async () => {
  if (viteServer) {
    await viteServer.close();
  }
  app.quit();
});
