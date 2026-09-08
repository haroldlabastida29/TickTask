const { app, BrowserWindow } = require('electron');
const path = require('path');

// Pass Electron's safe user data path to the environment so server.js can use it
process.env.USER_DATA_PATH = app.getPath('userData');

// This imports your Express server script and boots it up automatically
require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, 'assets/icon.ico'), // Add this line
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  const PORT = process.env.PORT || 3000;
  mainWindow.loadURL(`http://localhost:${PORT}`);

  // Force the window to focus once it's ready to show to prevent input locking
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});