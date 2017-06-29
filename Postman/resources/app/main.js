var electron = require('electron'),
    app = electron.app,
    autoUpdater = electron.autoUpdater,
    BrowserWindow = electron.BrowserWindow,
    Menu = electron.Menu,
    shell = electron.shell,
    dialog = electron.dialog,
    ipc = electron.ipcMain,
    circularJSON = require('circular-json'),
    _ = require('lodash').noConflict(),
    urlParse = require('url-parse'),
    electronProxy = require('./background-modules/electronProxy').electronProxy,
    postmanApi = require('./background-modules/postmanApi').postmanApi,
    interceptorManifest = require('./background-modules/interceptorManifest').interceptorManifest,
    menuManager = require('./background-modules/menuManager').menuManager,
    windowManager = require('./background-modules/windowManager').windowManager,
    loginUtils = require('./background-modules/loginUtils').loginUtils,
    getParamsString = require('./common/utils/url').getParamsString;
    os = require('os'),
    loginWindow = null;

require('./background-modules/RuntimeBridge');

//flag set to perform tasks before quiting
app.quiting = false;

const AUTH_CAPTURE_URL =  'https://erisedstraehruoytubecafruoytonwohsi.chromiumapp.org';

if (os.type() == 'Windows_NT') {
  if(process.argv && process.argv.length > 1 &&
     process.argv[1] && process.argv[1].startsWith('postman://')) {
    var url = process.argv[1];
    windowManager.initUrl = url;
    windowManager.openUrl(url);
  }
  if (require('electron-squirrel-startup')) return;
}

// Postman's API will run here. will be used by the interceptor for sending captured requests
var API_SERVER_PORT = 8082,
    thisVersion = null,
    thisName = null,
    thisPlatform = "OSX",
    initUrl = null, //URL set when app is opened via a postman:// link
    immediateUpdateFunction = null; //function to call when "restartAndUpdate" is clicked

function attachUpdaterListeners() {
  autoUpdater.on('update-available', function(update) {
    console.log("update-available: " + JSON.stringify(update));
  });

  autoUpdater.on('checking-for-update', function(update) {
    console.log("checking-for-update: " + JSON.stringify(update));
  });

  autoUpdater.on('update-downloaded', function(event, notes, name, date, url, quitAndUpdate) {
    console.log("update-downloaded: " + notes + " " + name + " " + url);
    immediateUpdateFunction = quitAndUpdate;
    windowManager.sendInternalMessage({
      "event": "electronUpdateDownloaded",
      "object": name,
      "object2": notes
    });
  });

  autoUpdater.on('update-not-available', function(a) {
    console.log("Update not available");
    windowManager.sendInternalMessage({
      event: "electronUpdateNotFound"
    });
  });

  autoUpdater.on('error', function(a,b) {
    console.log("autoUpdate error: " + JSON.stringify(a) + " " + JSON.stringify(b));
    windowManager.sendInternalMessage({
      event: "electronUpdateError"
    });
  });
}

function attachIpcListeners() {
  ipc.on('newRunnerWindow', (event, arg) => {
    windowManager.newRunnerWindow(arg);
  });

  ipc.on('newConsoleWindow', function(event, arg) {
    windowManager.newConsoleWindow(arg);
  });

  ipc.on('startAuthLogin', function(event, authUrl) {
    var authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      title: 'Postman',
      webPreferences: {
        nodeIntegration: false,
      }
    });
    authWindow.loadURL(authUrl);
    authWindow.show();
    console.log("Starting Browser login with URL: " + authUrl);
    authWindow.webContents.on('did-get-redirect-request', function(event, oldUrl, newUrl) {
      console.log("Browser redirect to newUrl = " + newUrl);
      var error = /\?error=(.+)$/.exec(newUrl);

      if (error) {
        // Close the browser if code found or error
        console.log("Error: ", error);
        windowManager.sendInternalMessage({event: "browserLoginError"});
        authWindow.close();
      }

      if(_.startsWith(newUrl, AUTH_CAPTURE_URL)) {
        //send back to renderer
        console.log("Send success back to renderer: ", newUrl);
        windowManager.sendInternalMessage({event: "browserLoginCallback", object: newUrl});
        authWindow.close();
      }
    });

    authWindow.on('close', function() {
      authWindow = null;
    }, false);
  });

  ipc.on('startBrowserLogin', (event, options) => {
    if(loginWindow != null) {
      if(_.isFunction(loginWindow.focus)) {
        loginWindow.focus()
        return;
      }
    }
    let {
          url,
          session_name,
          clean_session = false,
          isEnterpriseLogin = false,
          isForceLogin = false
        } = options;
    loginWindow = new BrowserWindow({
      width: 1000,
      height: 800,
      show: false,
      title: 'Postman',
      webPreferences: {
        nodeIntegration: false,
        partition: session_name
      }
    });
    // clean the storageData only if the session is provided for safety
    if(!_.isEmpty(session_name) && clean_session) {
      loginWindow.webContents.session.clearStorageData(() => {
        console.log('Cleared all storageData for clean session: ' + session_name);
      });
    }
    loginWindow.loadURL(url);
    loginWindow.show();
    console.log("Starting Browser login with URL: " + url);

    loginWindow.webContents.on('did-get-redirect-request',(event, oldUrl, newUrl) => {
      console.log("LoginWindow redirected to Url = " + newUrl);
      var error = /\?error=(.+)$/.exec(newUrl);

      if (!isEnterpriseLogin && error) {
        // Close the browser if code found or error
        console.log("Error: ", error);
        windowManager.sendInternalMessage({event: "browserLoginError"});
        loginWindow.close();
      }
      if(_.startsWith(newUrl, AUTH_CAPTURE_URL)) {
        //send back to renderer
        console.log("Send success back to renderer: ", newUrl);
        windowManager.sendInternalMessage({event: "browserLoginCallback", object: newUrl});
        loginWindow.close();
      }
    });

    // Only usage is when the user clicks on the retry link in-case of different user login in enterprise flow
    loginWindow.webContents.on('will-navigate', (event, url) => {
      console.log("LoginWindow navigated to Url = " + url);
      if(_.startsWith(url, AUTH_CAPTURE_URL)) {
        if(isEnterpriseLogin) {
          options.additionalParams = {};
          var params = urlParse(url, true).query;
          console.log('List of params from Enterprise login flow', params);
          if(!_.isEmpty(params.error) && params.retry) {
            if(!_.isEmpty(params.return)) {
              return loginWindow.webContents.session.clearStorageData(() => {
                loginWindow.loadURL(options.loginHost + params.return);
              });
            }
            console.log('Hits the retry case', params);
            options.additionalParams = params;
            return loginWindow.webContents.session.clearStorageData(() => {
              let paramsObj = loginUtils.getParamsObjectForLogin(options),
                  retryUrlPath = options.loginHost + options.loginPath +'?' + getParamsString(paramsObj);
              console.log('redirected to url from for retry to', retryUrlPath);
              loginWindow.loadURL(retryUrlPath);
            });
          }
        }
      }
    });

    loginWindow.on('close', () => {
      loginWindow = null;
    }, false);

  });

  ipc.on("messageToElectron", function(event, arg) {
    if(arg.event === "startProxy") {
      var port = 8080;
      if(arg.data && arg.data.port) {
        port = arg.data.port;
      }
      if(typeof port === "string") {
        port = parseInt(port);
      }
      console.log("Starting proxy on port: " + port);
      try {
        var ret = electronProxy.startProxy(
            port,
            function () {
              sendInternalMessage({event: "proxyClosed", object: {}})
            },
            sendCapturedProxyRequest
        );
        event.sender.send("proxyStarted", ret);
        windowManager.sendInternalMessage({event: "proxyNotif", "object": "start", "object2": "success"});
      }
      catch(e) {
        //error while starting proxy
        console.log("Error while starting proxy: " , e);
        windowManager.sendInternalMessage({event: "proxyNotif", "object": "start", "object2": "failure"});
      }
    }
    else if(arg.event === "stopProxy") {
      try {
        electronProxy.stopProxy();
        windowManager.sendInternalMessage({event: "proxyNotif", "object": "stop", "object2": "success"});
      }
      catch(e) {
        windowManager.sendInternalMessage({event: "proxyNotif", "object": "stop", "object2": "failure"});
      }
    }
    else if(arg.event === "installInterceptorManifest") {
      installInterceptorManifest();
    }
    else if(arg.event==="updateElectronVersion") {
      updateVersion(arg);
    }
    else if(arg.event==="restartAndUpdate") {
      app.quiting = true;
      restartAndUpdate();
    }
    else if(arg.event==="postmanInitialized") {
      //sent by the primary window when indexedDB has loaded
      windowManager.newRequesterOpened();
    }
  });

  ipc.on('getSaveTarget', function(event, arg) {
    var retPath = showSaveDialog(event.sender, arg);
    if(!retPath) {
      event.returnValue = null;
    }
    else {
      event.returnValue = retPath;
    }
  });

  ipc.on("sendToAllWindows", function(event, arg) {
    try {
      let parsedArg = circularJSON.parse(arg);

      windowManager.sendInternalMessage(parsedArg);

      if(parsedArg.event === "pmWindowPrimaryChanged") {
        windowManager.primaryId = arg.object;
        console.log('Primary Window set (id: ' + windowManager.primaryId + ')');
      }
      else if (parsedArg.event === 'quitApp') {
        windowManager.quitApp();
      }
    }
    catch(e) {
      console.log('Malformed message, ignoring.')
    }
  });

  ipc.on("newRequesterWindow", function(event, arg) {
    windowManager.newRequesterWindow()
  });

  ipc.on("closeRequesterWindow", function(event, arg) {
    windowManager.closeRequesterWindow(arg)
  });

  ipc.on("historyChanged", function(event, arg) {
    arg = JSON.parse(arg)
    menuManager.appendHistory(arg)
  });
}

process.on('uncaughtException',function(e) {
  handleUncaughtError(e)
});

function handleUncaughtError() {
  //Can happen for proxy error
  //explore other possibilities
  //TODO: Kane
}

function openCustomURL(url) {
  shell.openExternal(url);
}

function runPostmanShortcut(action, url) {
  if(action == "reloadWindow") {
    var win = BrowserWindow.getFocusedWindow();
    if(win) {
      win.reloadIgnoringCache();
    }
  }
  else if(action == "newWindow") {
    windowManager.newRequesterWindow();
  }
  else if(action == "toggleDevTools") {
    var win = BrowserWindow.getFocusedWindow();
    if(win) {
      win.toggleDevTools();
    }
  }
  else if(action == "openCustomUrl") {
    openCustomURL(url);
  }
  else if(action === 'newTab') {
    windowManager.sendCustomInternalEvent(action);
  }
  else if(action === 'closeTab') {
    windowManager.sendCustomInternalEvent(action);
  }
  else if(action === 'closeWindow') {
    var win = BrowserWindow.getFocusedWindow();
    win && win.close();
  }
  else if(action === 'nextTab') {
    windowManager.sendCustomInternalEvent(action);
  }
  else if(action === 'previousTab') {
    windowManager.sendCustomInternalEvent(action);
  }
  else {
    windowManager.sendToFirstWindow({
      name: "internalEvent",
      data: {
        event: action
      }
    });
  }
}

function restartAndUpdate() {
  if(typeof immediateUpdateFunction === "function") {
    immediateUpdateFunction();
  }
}

function updateVersion(arg) {
    var url = getFeedUrl(arg);
    autoUpdater.setFeedURL(url);
  autoUpdater.checkForUpdates();
}

function getFeedUrl(arg) {
  var channel = arg.data.channel,
      platform = arg.data.platform,
      releaseServerURL = arg.data.updateServerDomain,
      feedUrl = '',
      releaseServerChannel = _.includes(['prod', 'stage'], channel) ? 'stable' : channel;

  // squirrel-mac specific endpoints
  if (platform === 'OSX') {
    feedUrl = releaseServerURL + 'update/status?' +
      'currentVersion=' + arg.data.version +
      '&platform=' + platform.toLowerCase() +
      '&channel=' + releaseServerChannel;
      console.log('osx other channel release server url', feedUrl);
    return feedUrl;
  }

  // app release endpoints for windows. arch is included in the platform (WIN32/WIN64)
  feedUrl = releaseServerURL +
    'update/' +
    platform.toUpperCase() + // Uppercased due to a bug in release server
    '/' +
    arg.data.version +
    '/' +
    releaseServerChannel;
    console.log('Windows release server url', feedUrl);
  return feedUrl;
}

function sendCapturedProxyRequest(url, method, headers, data) {
  if(!data) {
    data = "";
  }
  windowManager.sendInternalMessage({
      event: "proxyRequestCaptured",
      object: {
        url: url,
        method: method,
        headers: headers,
        data: data
      }
    });
}

function installInterceptorManifest() {
  var manifest = interceptorManifest.getManifest("osx");
  interceptorManifest.saveFile("osx", manifest);
}

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  if (process.platform != 'darwin')
      app.quit();
});

app.on('before-quit', function(event) {
  // bypass state saving logic if no windows are open
  if (!windowManager.hasOpenWindows()) {
    app.quiting = true;
  }

  if (!app.quiting) {
    event.preventDefault();
    app.quiting = true;
    windowManager.sendInternalMessage({
      event: 'saveAllWindowState'
    })
  }
});

function sendToAllWindows(message) {
  //send event to all other windows
  var numWindowsLeft = 0;
  if(openWindowIds && openWindowIds.length) {
    numWindowsLeft = openWindowIds.length;
  }

  for(var i=0;i<numWindowsLeft;i++) {
    var bWindow = BrowserWindow.fromId(parseInt(openWindowIds[i]));
    if(!bWindow) {
      continue;
    }
    bWindow.webContents.send('electronWindowMessage', message);
  }
}


function sendToFirstWindow(message) {
  var numWindowsLeft = openWindowIds.length;
  for(var i=0;i<numWindowsLeft;i++) {
    var bWindow = BrowserWindow.fromId(parseInt(openWindowIds[i]));
    if(!bWindow) {
      continue;
    }
    console.log("Sending electronWindowMessage");
    bWindow.webContents.send('electronWindowMessage', message);
    return;
  }
}

function focusFirstWindow() {
  var numWindowsLeft = openWindowIds.length;
  for(var i=0;i<numWindowsLeft;i++) {
    var bWindow = BrowserWindow.fromId(parseInt(openWindowIds[i]));
    if(!bWindow) {
      continue;
    }
    bWindow.show();
    bWindow.restore();
    return;
  }
}

//when a window closes
function windowClosed(windowId) {
  //remove windowId from openWindowIds
  var index = openWindowIds.indexOf(windowId);
  if(index!==-1) {
    openWindowIds.splice(index, 1);
  }

  //send event to all other windows
  sendToAllWindows({
    name: "otherWindowClosed",
    data: {
      "id": windowId
    }
  });
}

function showSaveDialog(window, fileName) {
  var savePath = dialog.showSaveDialog({
    title: "Select path to save file",
    defaultPath: '~/' + fileName
  });
  return savePath;

}
attachIpcListeners();
attachUpdaterListeners();

thisVersion = app.getVersion();
thisName = app.getName();
windowManager.initialize(thisVersion);

var dockMenu = Menu.buildFromTemplate([
  { label: 'New Collection', click: function() {runPostmanShortcut('newCollection');} },
  { label: 'New Window ', click: function() {runPostmanShortcut('newWindow');}}
]);


var myWindow = null;



// This method will be called when Electron has done everything
// initialization and ready for creating browser windows.
app.on('ready', function() {
  myWindow = windowManager.newRequesterWindow(1);
  menuManager.createMenu()
  if (app.dock) { // app.dock is only available on OSX
    app.dock.setMenu(dockMenu);
  }
});

app.on('open-url', function(event, url) {
  event.preventDefault();
  windowManager.initUrl = url;
  windowManager.openUrl(url);
});

var shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (myWindow) {
    if (os.type() == 'Windows_NT') {
      if(process.argv && process.argv.length > 1 &&
         process.argv[1] && process.argv[1].startsWith('postman://')) {
        var url = process.argv[1];
        windowManager.initUrl = url;
        windowManager.openUrl(url);
      }
    }
    if (myWindow.isMinimized()) myWindow.restore();
    myWindow.focus();
  }
});

if(os.type() !== 'Linux') {
  // For Linux it is not supported
  app.setAsDefaultProtocolClient('postman');
}

if (shouldQuit) {
  app.quit();
  return;
}

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  if (process.platform != 'darwin')
    app.quit();
});

app.on('activate', function(e, hasWindows) {
  if(!hasWindows) {
    windowManager.newRequesterWindow(1);
  }
});
