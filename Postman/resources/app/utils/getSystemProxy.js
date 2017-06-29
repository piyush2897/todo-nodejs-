var _ = require('lodash'),
    HTTP_PROTOCOL = 'http://',
    HTTPS_PROTOCOL = 'https://';

/**
 *  @param {PostmanUrl} url resolved request url
 *  @param {function} cb callback
 *
 * @returns {undefined}
 */
module.exports = (url, cb) => {
  var session = require('electron').session.defaultSession,
      protocol = (_.startsWith(url, HTTP_PROTOCOL) || _.startsWith(url, HTTPS_PROTOCOL)) ? '' : HTTP_PROTOCOL,
      proxyUrls,
      proxyUrl,
      sanitizedUrl = protocol + url;

  try {
    session.resolveProxy(sanitizedUrl, (value) => {
      if (value === 'DIRECT') {
        return cb(null, undefined);
      }

      /**
        Electron return if the there is no proxy means
        DIRECT || PROXY [url]:port
        using the regex [\[\]PROXY ] to replace the unwanted values with ''

        [\[\]PROXY ] Regex info:
        =======================
          \[ matches the character [ literally
          \] matches the character ] literally
          PROXY  a single character in the list PROXY  literally (case sensitive)
      */
      // /value =  PROXY [http://0.0.0.0]:8080;DIRECT;PROXY [http://0.0.0.0]:8081
      proxyUrls = value.replace(/PROXY/g, '')   // value =  [http://0.0.0.0]:8080;DIRECT; [http://[0.0.0.0]]:8081
                           .replace(/DIRECT/g, '')  // value =  [http://0.0.0.0]:8080;; [http://[0.0.0.0]]:8081
                           .replace(/ \[/g, '')    // http://0.0.0.0]:8080;;http://[0.0.0.0]]:8081
                           .replace(/\]:/g, ':')    // http://0.0.0.0:8080;;http://[0.0.0.0]]:8081
                           .replace(/ /g, '');      // http://0.0.0.0:8080;;http://[0.0.0.0]]:8081

      /**
      * For Proxy Load balancing the pac scripts will return the Proxy with two URLs seperated by ';'
      * We by default will be considering only the first proxy URL
      * electron will parse and will give the proxy string as `PROXY [http://0.0.0.0]:8080;PROXY [http://0.0.0.0]:8081`
      */
      proxyUrl = proxyUrls.split(';');

      /**
      * Appending the protocol if it is not available in the proxyUrl returned by the electron
      **/
      protocol = (_.startsWith(proxyUrl[0], HTTP_PROTOCOL) || _.startsWith(proxyUrl[0], HTTPS_PROTOCOL)) ? '' : HTTP_PROTOCOL;

      proxyUrl = protocol + proxyUrl[0];

      /**
      *
      * Right now the tunnel option is set to true by default,
      * we need to get the settings to have this as a option.
      * Ref :
      *  Requester proxies: https://github.com/request/request#proxies
      *  tunnel : https://en.wikipedia.org/wiki/HTTP_tunnel
      *
      */
      return cb(null, {
        match: url,
        server: proxyUrl,
        tunnel: _.startsWith(sanitizedUrl, 'https://')
      });
    });
  }
  catch (e) {
    return cb(e);
  }

  // this is here to please eslint
  return null;
};
