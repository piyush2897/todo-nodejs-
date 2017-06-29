var ipcMain = require('electron').ipcMain,
    runtime = require('postman-runtime'),
    sdk = require('postman-collection'),
    _ = require('lodash'),
    SerializedError = require('serialised-error'),
    getSystemProxy = require('../utils/getSystemProxy'),
    cookieManagerInstance = require('./models/CookieManager'),
    fs = require('fs');

var { stringifyCookieObject, _parseCookieHeader } = require('../common/utils/cookie');
var { ensureProperUrl, getURLProps } = require('../common/utils/url');

var runPool = {};

/**
 * serialize an error into a JSON string
 * @param {Error} error Error object to be stringified
 *
 * @return {string} Stringified error
 */
function wrapError (error) {
  return error && JSON.stringify(new SerializedError(error));
}

/**
 * Get cookies from a cookieManager and adds them to a cookieJar
 * @param {CookieManager} cookieManager CookieManager instance with cookies
 * @param {CookieJar} cookieJar CookieJar instance to move the cookies to
 *
 * @returns {undefined}
 */
function putCookiesInTheJar (cookieManager, cookieJar) {
  cookieManager.getCookies((err, cookies) => {
    if (err) { return; }
    _.forEach(cookies, (cookie) => {
      var domain = cookie.domain,
          url,
          cookieString;

      if (domain[0] === '.') {
        domain = domain.substring(1);
      }

      url = 'http://' + domain + cookie.path;
      cookieString = stringifyCookieObject(cookie);

      try {
        cookieJar.setCookie(cookieString, url);
      }
      catch (e) {
        console.error(e);
      }
    });
  });

}

/**
 * adds cookies from headers to cookieJar
 * @param {CookieJar} cookieJar where the cookies have to be moved
 * @param {array} requestHeaders Headers from a Request
 * @param {String} requestUrlValue Url of the request the headers belong to
 * @param {String} requestUrlHost Host of the request Url
 *
 * @returns {undefined}
*/
function addCookiesFromHeaderToJar (cookieJar, requestHeaders, requestUrlValue, requestUrlHost) {
  var cookiesFromRequest;
  _.forEach(requestHeaders, (header) => {
    if (header && _.isString(header.key) && header.key.toLowerCase() === 'cookie') {
      try {
        cookiesFromRequest = _parseCookieHeader(requestUrlHost, header.value);
        _.forEach(cookiesFromRequest, (cookie) => {

          try {
            cookieJar.setCookie(stringifyCookieObject(cookie), requestUrlValue);
          }
          catch (e) {
            console.error(e);
          }
        });
      }
      catch (e) {
        console.error(e);
      }
    }
  });
}

/**
 * Extract cookies from the jar and add them to the cookieManager
 *
 * @param {CookieJar} cookieJar to read cookies from
 * @param {CookieManager} cookieManager Target CookieManager to move cookies into
 * @param {string} transformedUrl Final request Url
 * @param {function} cb callback called with the cookie
 *
 * @returns {undefined}
*/
function addCookiesFromJarToCookieManager (cookieJar, cookieManager, transformedUrl, cb) {
  var sentUrl = getURLProps(ensureProperUrl(transformedUrl)),
      domain = sentUrl.hostname,
      path = sentUrl.pathname;

  // todo: we're using a private object here (hence the crazy number of checks),
  // because the API provided by the cookieJar is not good enough. Need to submit a PR
  // to the upstream "request" module to expose this functionality.
  cookieJar._jar &&
  cookieJar._jar.store &&
  cookieJar._jar.store.findCookies &&
  cookieJar._jar.store.findCookies(domain, path, (error, cookiesFromJar) => {
    cookieManager.pushCookies(cookiesFromJar, transformedUrl, (cookies) => {
      cb(null, cookies);
    });
  });
}

/**
 * Extracts headers from a request
 *
 * @param {Request} request  request object to extract headers from
 *
 * @return {array} headers Request headers
*/
function getHeadersFromRequest (request) {
  return _.reduce(request.header, (accumulator, header) => {
    accumulator.push({
      name: header.key,
      key: header.key,
      value: header.value,
      enabled: !_.get(header, 'disabled', false)
    });
    return accumulator;
  }, []);
}

/**
* Converts any sdk object into a JSON, safely
*
* @param {*|undefined} sdkObject  any sdk object
*
* @return {object|undefined} JSON representation of the sdk object
*/
function serializeSDKObject (sdkObject) {
  if (_.isNil(sdkObject)) {
    return sdkObject;
  }

  if (_.isFunction(sdkObject.toJSON)) {
    return sdkObject.toJSON();
  }

  // malformed sdk object or not one
  return sdkObject;
}

/**
 * Makes sure there are no pending callbacks before disposing a run.
 *
 * @param {String} runId uuid that identifies a run instance.
 *
 * @return {undefined} undefined
 */
function disposeRun (runId) {
  var runCache = runPool[runId],
      run;
  if (!runCache) {
    return;
  }

  if (runCache.pendingCallbacks === 0) {
    run = runCache.run;
    run.host && _.isFunction(run.host.dispose) && run.host.dispose();
    delete runPool[runId];
    return;
  }

  setTimeout(disposeRun, 1000, runId);
}

ipcMain.on('RUNTIME_RUN_CREATE', (event, id, runnerOptions, requesterInstanceOptions = {}, runOptions, runMetaData = {}, collection) => {
  var options = _.clone(runnerOptions),
      cookieJar = require('./cookieJar').cookieJar.create(),
      runner, sender;

  options.run = options.run || {};

  // sanitize options
  if (_.isObject(requesterInstanceOptions)) {
    requesterInstanceOptions.cookieJar = cookieJar;

    // Add cookies from cookieManager to the cookieJar
    putCookiesInTheJar(cookieManagerInstance, cookieJar);

    options.run.requester = {
      external: true,
      instance: new (runtime.Requester)(requesterInstanceOptions)
    };
  }

  runOptions.fileResolver = fs;
  runOptions.systemProxy = getSystemProxy;
  runOptions.certificates = new sdk.CertificateList({}, runMetaData.certificates);

  runner = new (runtime.Runner)(options);
  sender = event.sender;
  sdkCollection = new sdk.Collection(collection);

  // create a run
  runner.run(sdkCollection, runOptions, (runCreateError, run) => {
    var transformedUrl;

    if (runCreateError) {
      sender.send(`RUNTIME_RUN_CREATE_ERROR_${id}`, wrapError(runCreateError));
    }

    // add the run and sender to the pool for callbacks
    runPool[id] = {
      run,
      sender,
      pendingCallbacks: 0
    };

    // send success event
    sender.send(`RUNTIME_RUN_CREATE_${id}`, id);

    run.start({
      // callback stubs
      // essentially they are proxies to the actual callback on render process

      start (err, cursor) {
        sender.send('RUNTIME_CALLBACK_START', id, wrapError(err), cursor);
      },

      beforeIteration (err, cursor) {
        sender.send('RUNTIME_CALLBACK_BEFOREITERATION', id, wrapError(err), cursor);
      },

      beforeItem (err, cursor, item) {
        sender.send('RUNTIME_CALLBACK_BEFOREITEM', id, wrapError(err), cursor, serializeSDKObject(item));
      },

      beforePrerequest (err, cursor, events, item) {
        sender.send('RUNTIME_CALLBACK_BEFOREPREREQUEST', id, wrapError(err), cursor, JSON.stringify(events), serializeSDKObject(item));
      },

      prerequest (err, cursor, prResults, item) {
        _.forEach(prResults, (test) => {
          test.result.globals = test.result.globals.values.syncToObject();
          test.result.environment = test.result.environment.values.syncToObject();
        });

        sender.send('RUNTIME_CALLBACK_PREREQUEST', id, wrapError(err), cursor, JSON.stringify(prResults), serializeSDKObject(item));
      },

      beforeRequest (err, cursor, req, item, aborter) {
        var currentRunData = runPool[id],
            requestJson = req.toJSON(),
            requestUrlHost = req.url.getHost(),
            requestHeaders = getHeadersFromRequest(requestJson);

        // store aborter so this request could be aborted at later point
        currentRunData && (currentRunData.requestAborter = aborter);

        transformedUrl = req.url.getRemote();

        addCookiesFromHeaderToJar(cookieJar, requestHeaders, requestJson.url, requestUrlHost);

        sender.send('RUNTIME_CALLBACK_BEFOREREQUEST', id, wrapError(err), cursor, serializeSDKObject(req), serializeSDKObject(item), aborter);
      },


      request (err, cursor, responseObj, requestObj, item, cookies) {
        sender.send('RUNTIME_CALLBACK_REQUEST', id, wrapError(err), cursor, serializeSDKObject(responseObj), serializeSDKObject(requestObj), serializeSDKObject(item), cookies);
      },

      assertion (cursor, assertion) {
        sender.send('RUNTIME_CALLBACK_ASSERTION', id, cursor, JSON.stringify(assertion));
      },

      beforeTest (err, cursor, events, item) {
        sender.send('RUNTIME_CALLBACK_BEFORETEST', id, wrapError(err), cursor, JSON.stringify(events), serializeSDKObject(item));
      },

      test: (err, cursor, testResults, item) => {
        _.forEach(testResults, (test) => {
          test.result.globals = test.result.globals.values.syncToObject();
          test.result.environment = test.result.environment.values.syncToObject();
        });

        sender.send('RUNTIME_CALLBACK_TEST', id, wrapError(err), cursor, JSON.stringify(testResults), serializeSDKObject(item));

        // to make sure the run instance is not disposed before completing the callback
        runPool[id] && runPool[id].pendingCallbacks++;

        // Setting and deleting cookies
        // this flow is included for each request in a collection run.
        // need to evaluate whether using the same flow for both is justified
        addCookiesFromJarToCookieManager(cookieJar, cookieManagerInstance, transformedUrl, (addCookiesError, cookies) => {
          // custom callback - not part of runtime - to handle cookies.
          // @todo remove after adding a cookie store to runtime
          sender.send('RUNTIME_CALLBACK_COOKIES', id, wrapError(addCookiesError), cookies);
          runPool[id] && runPool[id].pendingCallbacks--;
        });
      },

      item (err, cursor, item) {
        sender.send('RUNTIME_CALLBACK_ITEM', id, wrapError(err), cursor, serializeSDKObject(item));
      },

      iteration (err, cursor) {
        sender.send('RUNTIME_CALLBACK_ITERATION', id, wrapError(err), cursor);
      },

      exception (...args) {
        sender.send('RUNTIME_CALLBACK_EXCEPTION', id, ...args);
      },

      console (...args) {
        sender.send('RUNTIME_CALLBACK_CONSOLE', id, ...args);
      },

      pause (err, cursor) {
        sender.send('RUNTIME_CALLBACK_PAUSE', id, wrapError(err), cursor);
      },

      resume (err, cursor) {
        sender.send('RUNTIME_CALLBACK_RESUME', id, wrapError(err), cursor);
      },

      error (err) {
        sender.send('RUNTIME_CALLBACK_ERROR', id, wrapError(err));
      },

      done (err, cursor) {
        sender.send('RUNTIME_CALLBACK_DONE', id, wrapError(err), cursor);
      },

      stop (err, ...args) {
        sender.send('RUNTIME_CALLBACK_STOP', id, wrapError(err), ...args);
      },

      abort (err, ...args) {
        sender.send('RUNTIME_CALLBACK_ABORT', id, wrapError(err), ...args);
      }
    });
  });
});

// proxy for run pause
ipcMain.on('RUNTIME_RUN_PAUSE', (event, id) => {
  var run = runPool[id].run;
  run && run.pause();
});

// proxy for run resume
ipcMain.on('RUNTIME_RUN_RESUME', (event, id) => {
  var run = runPool[id].run;
  run && run.resume();
});

// proxy for run stop
ipcMain.on('RUNTIME_RUN_STOP', (event, id) => {
  // runtime cannot stop runs if it is in paused state
  // so resume it and then stop it
  var run = runPool[id].run;
  run && run.resume();
  run && run.abort();
});

// proxy for request and run stop
ipcMain.on('RUNTIME_RUN_STOP_REQUEST', (event, id) => {
  var runData = runPool[id];

  if (!runData) {
    return;
  }

  // if there is a request in flight stop it
  if (runData.requestAborter) {
    // abort the request
    runData.requestAborter.abort();
  }

  // abort the run
  // runtime cannot stop runs if it is in paused state
  // so resume it and then stop it
  runData.run && runData.run.resume();
  runData.run && runData.run.abort();
});

// proxy for run dispose
ipcMain.on('RUNTIME_RUN_DISPOSE', (event, id) => {
  disposeRun(id);
});
