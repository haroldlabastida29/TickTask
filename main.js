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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Load your app through the local server port
  const PORT = process.env.PORT || 3000;
  mainWindow.loadURL(`http://localhost:${PORT}`);

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