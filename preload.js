const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winCtl', {
  min: () => ipcRenderer.send('win:min'),
  max: () => ipcRenderer.send('win:max'),
  close: () => ipcRenderer.send('win:close')
});
