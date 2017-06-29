var electron = require('electron'),
    Storage = require('electron-json-storage'),
    app = electron.app,
    shell = electron.shell,
    BrowserWindow = electron.BrowserWindow,
    path = require('path'),
    _ = require('lodash').noConflict();

exports.windowManager = {
  primaryId: '1',
  openWindowIds: [],
  requesterPath: null, //set in initialize()
  testRunnerPath: null, //set in initialize()
  thisVersion: null,
  initUrl: null,
  windowState: {},

  initialize(thisVersion) {
    if (process.env.PM_BUILD_ENV !== 'development') {
      this.requesterPath = 'file://' + __dirname + '/../html/requester.html';
      this.testRunnerPath = 'file://' + __dirname + '/../html/runner.html';
			this.testConsolePath = 'file://' + __dirname + '/../html/console.html';
    }
    else {
      this.requesterPath = 'http://localhost:8777/build/electron/html/requester.html';
      this.testRunnerPath = 'http://localhost:8777/build/electron/html/runner.html';
			this.testConsolePath = 'http://localhost:8777/build/electron/html/console.html';
    }
    this.thisVersion = thisVersion;
    this.closedHandler = this.closedHandler.bind(this);
    this.debouncedStateChangeHandler = _.debounce(this.stateChangeHandler.bind(this), 100);
  },

  focusFirstWindow() {
    const numWindowsLeft = this.openWindowIds.length;
    for(var i = 0; i < numWindowsLeft; i++) {
      var bWindow = BrowserWindow.fromId(parseInt(this.openWindowIds[i]));
      if(!bWindow) {
        continue;
      }
      bWindow.show();
      bWindow.restore();
      return;
    }
  },

  sendCustomInternalEvent(action, object) {
    var message = {
      name: "internalEvent",
      data: {
        event: action,
        object: object
      }
    };
    var bWindow = BrowserWindow.getFocusedWindow();
    if(!bWindow) {
      return;
    }
    bWindow.webContents.send('electronWindowMessage', message);
  },

  sendToFirstWindow(message) {
    var numWindowsLeft = this.openWindowIds.length;
    for(var i=0; i < numWindowsLeft; i++) {
      var bWindow = BrowserWindow.fromId(parseInt(this.openWindowIds[i]));
      if(!bWindow) {
        continue;
      }
      bWindow.webContents.send('electronWindowMessage', message);
      return;
    }
  },

  sendToAllWindows(message) {
    //send event to all other windows
    var numWindowsLeft = 0;
    if(this.openWindowIds && this.openWindowIds.length) {
      numWindowsLeft = this.openWindowIds.length;
    }

    for(var i=0;i<numWindowsLeft;i++) {
      var bWindow = BrowserWindow.fromId(parseInt(this.openWindowIds[i]));
      if(!bWindow) {
        continue;
      }
      bWindow.webContents.send('electronWindowMessage', message);
    }
  },

  sendInternalMessage(message) {
    this.sendToAllWindows({
      name: 'internalEvent',
      data: message
    });
  },

  hasExtension(extensionName) {
    return BrowserWindow.getDevToolsExtensions().hasOwnProperty(extensionName);
  },

  attachDevToolsExtensions() {
    if (process.env.PM_BUILD_ENV !== 'development') {
      return;
    }

    try {
      if (!this.hasExtension('React Developer Tools')) {
        var reactDevToolsPath = path.resolve(
          app.getPath('appData'),
          'Google/Chrome/Default/Extensions/fmkadmapgofadopljbjfkapdkoienihi/0.15.7_0'
        );
        BrowserWindow.addDevToolsExtension(reactDevToolsPath);
      }
    }
    catch (e) {
      console.error('React Devtools Error: ', e.message, ', Path: ', reactDevToolsPath);
    }

    // try {
    //   var reduxDevToolsPath = path.resolve(
    //     app.getPath('appData'),
    //     'Google/Chrome/Default/Extensions/lmhkpmbekcpmknklioeibfkpmmfibljd/2.5.0.1_0'
    //   );
    //   BrowserWindow.addDevToolsExtension(reduxDevToolsPath);
    // }
    // catch (e) {
    //   console.error('Redux Devtools Error: ', e.message, ', Path: ', reactDevToolsPath);
    // }

    try {
      if (!this.hasExtension('devtron')) {
        require('devtron').install();
      }
    }
    catch (e) {
      console.error('Devtron DevTools Error: ', e.message);
    }
  },

  getDefaultWindowState(windowName) {
    if (windowName === 'console')
      return {
        center: true,
				height: 450,
        width: 950
      };
    else
      return {
        center: true,
        height: 800,
        width: 1280
      };
  },

  loadWindowState(windowName, callback) {
    if (this.windowState[windowName]) {
      return callback(this.windowState[windowName]);
    }
    else {
      Storage.get(windowName, (error, lastWindowState) => {
        if (error) console.error('Failed to load window state: ' + windowName);
        return callback(error || _.isEmpty(lastWindowState) ? this.getDefaultWindowState(windowName) : lastWindowState);
      });
    }
  },

  saveWindowState(windowName, callback) {
    Storage.set(windowName, this.windowState[windowName], (error) => {
      if (error) console.error('Failed to store window state: ' + windowName);
      return callback();
    });
  },

  newRequesterOpened() {
    if(this.listenForRequesterWindow) {
      var mainWindow = this.listenForRequesterWindow;
      mainWindow.webContents.send('electronWindowMessage', {
        name: 'protocolEventOnInit',
        data: this.initUrl
      });
      this.initUrl = null;
      this.listenForRequesterWindow = null;
    }
  },

  quitApp() {
    app.quiting = true;
    app.quit();
  },

  getWindowPref(title) {
    return {
      title: title,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false
      },
      icon: app.getAppPath() + '/assets/icon.png'
    };
  },

  setWindowMode(windowState, activeWindow) {
    if (windowState.isFullScreen)
      activeWindow.setFullScreen(true);
    else if (windowState.maximized)
      activeWindow.maximize();
  },

  newRequesterWindow() {
    const windowName = 'requester';

    this.loadWindowState(windowName, (windowState) => {
      let mainWindow = new BrowserWindow(Object.assign(
          this.getWindowPref('Postman'),
          windowState
        )),
        mainWindowId = mainWindow.id + '';

      this.windowState[windowName] = windowState;

      this.setWindowMode(windowState, mainWindow);

      this.attachDevToolsExtensions(mainWindow);

      if (!this.openWindowIds.length)
        this.primaryId = mainWindowId; //this is the only window. make it primary
      this.openWindowIds.push(mainWindowId);

      mainWindow.loadURL(this.requesterPath);

      mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.send('electronWindowMessage', {
          name: 'setWindowIds',
          data: {
            thisId: mainWindowId + '',
            primaryId: this.primaryId,
            allIds: this.openWindowIds,
            thisVersion: this.thisVersion
          }
        });

        if(this.initUrl) {
          this.listenForRequesterWindow = mainWindow;
        }
      });
      mainWindow.webContents.on('will-navigate', function(event, url) {
        event.preventDefault();
      });

      mainWindow.windowName = windowName;
      mainWindow.mainWindowId = mainWindowId;
      mainWindow.on('close', (event) => {
        if (process.platform !== 'win32' && !app.quiting && this.openWindowIds.indexOf(mainWindowId) >= 0) {
          event.preventDefault();
          this.sendInternalMessage({
            event: 'clearWindowStateAndQuit',
            object: mainWindowId + ''
          });
        }
        else if (process.platform === 'win32' && !app.quiting) {
          event.preventDefault();
          app.quiting = true;
           this.sendInternalMessage({
            event: 'saveAllWindowState'
          });
        }
      });
      this.addListeners(mainWindow);

      this.sendInternalMessage({
        event: 'pmWindowOpened',
        object: mainWindowId + ''
      });

      return mainWindowId;
    });
  },

  closeRequesterWindow (windowId) {
    var bWindow = BrowserWindow.fromId(parseInt(windowId));
    if (bWindow) {
      this.removeWindowId(windowId + '');
      bWindow.close();
    }
    return;
  },

  newRunnerWindow(testAttr) {
    const windowName = 'runner';

    this.loadWindowState(windowName, (windowState) => {
      let mainWindow = new BrowserWindow(Object.assign(
          this.getWindowPref('Collection Runner'),
          windowState
        )),
        mainWindowId = mainWindow.id + '';

      this.windowState[windowName] = windowState;

      this.setWindowMode(windowState, mainWindow);

      mainWindow.loadURL(this.testRunnerPath);
      mainWindow.webContents.on('did-finish-load',  () => {
        console.log("Sending test runner", testAttr);
        mainWindow.webContents.send('setTestRunnerAttrs', testAttr);
        mainWindow.webContents.send('electronWindowMessage', {
          name: 'setRunnerWindowId',
          data: {
            thisId: mainWindow.id + ''
          }
        });
      });
      mainWindow.webContents.on('will-navigate', function(event, url) {
        event.preventDefault();
      });

      this.openWindowIds.push(mainWindow.id);
      mainWindow.windowName = windowName;
      mainWindow.mainWindowId = mainWindowId;
      this.addListeners(mainWindow);
    });
  },

	newConsoleWindow() {
		const windowName = 'console';

		if (!this.consoleWindowId) {
			this.loadWindowState(windowName, (windowState) => {
				let mainWindow = new BrowserWindow(Object.assign(
						this.getWindowPref('Postman Console'),
						windowState
					));

					this.consoleWindowId = mainWindow.id + '';

          this.setWindowMode(windowState, mainWindow);

          this.windowState[windowName] = windowState;

					mainWindow.loadURL(this.testConsolePath);

          this.openWindowIds.push(this.consoleWindowId);

          mainWindow.windowName = windowName;
          mainWindow.mainWindowId = this.consoleWindowId;
          this.addListeners(mainWindow);
			})
		}
		else {
      console.log('console window : '+ this.consoleWindowId)
			let consoleWindow = BrowserWindow.fromId(parseInt(this.consoleWindowId));
			if(!consoleWindow) {
				return;
			}
			consoleWindow.show();
			consoleWindow.restore();
		}
	},

  addListeners(activeWindow) {
    activeWindow.on('closed', this.closedHandler);
    activeWindow.on('move', this.debouncedStateChangeHandler);
    activeWindow.on('resize', this.debouncedStateChangeHandler);
  },

  updateWindowState(windowName, activeWindow) {
    const bounds = activeWindow.getBounds();
    this.windowState[windowName] = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: activeWindow.isMaximized(),
      isFullScreen: activeWindow.isFullScreen()
    };
  },

  stateChangeHandler(e) {
    const activeWindow = e.sender;
    this.updateWindowState(activeWindow.windowName, e.sender);
    this.saveWindowState(activeWindow.windowName);
  },

  closedHandler(e) {
    const activeWindow = e.sender;
    console.log('Closed Window (id: ' + activeWindow.mainWindowId + ')');
    this.windowClosed(activeWindow.mainWindowId);
    this.removeListeners(activeWindow);
  },

  removeListeners(activeWindow) {
    activeWindow.removeListener('closed', this.closedHandler)
    activeWindow.removeListener('resize', this.debouncedStateChangeHandler)
    activeWindow.removeListener('move', this.debouncedStateChangeHandler)
  },

  openUrl(url) {
    if(this.openWindowIds.length > 0) {
      this.sendToFirstWindow({
        name: 'internalEvent',
        data: {
          event: "protocolEvent",
          object: this.initUrl
        }
      });
      this.focusFirstWindow();
      this.initUrl = null;
    }
  },

  removeWindowId (windowId) {
    //remove windowId from openWindowIds
    var index = this.openWindowIds.indexOf(windowId);
    if(index !== -1) {
      this.openWindowIds.splice(index, 1);
    }
  },

  windowClosed(windowId) {
    this.removeWindowId(windowId);
    //send event to all other windows
    this.sendToAllWindows({
      name: 'otherWindowClosed',
      data: {
        'id': windowId
      }
    });

		if (this.consoleWindowId === windowId) {
			this.consoleWindowId = null;
		}
  },

  openCustomURL(url) {
    shell.openExternal(url);
  },

  hasOpenWindows () {
    return !_.isEmpty(BrowserWindow.getAllWindows())
  }
};
