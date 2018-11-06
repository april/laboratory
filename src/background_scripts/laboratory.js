import localForage from 'localforage';
import { extractHostname } from './utils';

class Lab {
  constructor() {
    this.defaultState = () => {
      return {
        config: {
          customcspHosts: [],   // list of hosts where CSP is manually overridden
          customcspRecords: {}, // mapping of hosts to custom CSP records
          enforcedHosts: [],    // list of hosts we are enforcing the generate CSP policy on
          recordingHosts: [],   // list of hosts to record
          strictness: {
            'connect-src': 'self-if-same-origin-else-path',
            'font-src': 'origin',
            'frame-src': 'origin',
            'img-src': 'origin',
            'media-src': 'origin',
            'object-src': 'path',
            'script-src': 'self-if-same-origin-else-path',
            'style-src': 'self-if-same-origin-else-directory',
          },
        },
        records: {},  // hosts -> sources mapping
      };
    };

    // hoist static functions or something
    this.removeHttpHeaders = Lab.removeHttpHeaders;
    this.typeMapping = Lab.typeMapping;
    this.unmonitorableSites = Lab.unmonitorableSites;
  }


  static removeHttpHeaders(headers, headersToRemove) {
    // lower case the headers to remove
    const headersToRemoveL = headersToRemove.map(h => h.toLowerCase());

    // remove a list of response headers from a request object
    let i = headers.length;
    while (i > 0) {
      i -= 1;
      if (headersToRemoveL.includes(headers[i].name.toLowerCase())) {
        headers.splice(i, 1);
      }
    }

    return headers;
  }


  static get typeMapping() {
    return {
      audio: 'media-src',
      embed: 'object-src',
      font: 'font-src',
      image: 'img-src',
      imageset: 'img-src',
      manifest: 'manifest-src',
      media: 'media-src',
      object: 'object-src',
      other: 'connect-src',  // fetch?
      script: 'script-src',
      serviceworker: 'worker-src',
      sharedworker: 'worker-src',
      stylesheet: 'style-src',
      sub_frame: 'frame-src',
      track: 'media-src',
      video: 'media-src',
      websocket: 'connect-src',
      worker: 'worker-src',
      xbl: 'style-src',
      xmlhttprequest: 'connect-src',
      xslt: 'script-src',
    };
  }


  static get unmonitorableSites() {
    return [
      'addons.mozilla.org',
      'discovery.addons.mozilla.org',
      'testpilot.firefox.com',
    ];
  }

  // get the list of all monitored sites in one way or another
  getActiveHosts() {
    const hosts = new Set([].concat(
          this.state.config.customcspHosts,
          this.state.config.enforcedHosts,
          this.state.config.recordingHosts,
    ));

    return hosts;
  }


  siteTemplate() {
    const site = {};
    Object.keys(this.defaultState().config.strictness).map(x => {
      site[x] = [];  // TODO: convert to Set once localforage supports it
      return undefined;
    });

    return site;
  }


  init() {
    const hosts = this.getActiveHosts();

    // we create a listeners here to inject CSPRO headers
    // we define it globally so that we don't have to keep recreating anonymous functions,
    // which has the side effect of making it much easier to remove the listener
    if (this.onHeadersReceivedListener === undefined) {
      this.onHeadersReceivedListener = request => this.injectCspHeader(request);
      this.onBeforeRedirectListener = request => this.responseMonitor(request);
      this.onResponseStartedListener = request => this.responseMonitor(request);
    }

    // delete the old listeners, if we're listening
    if (browser.webRequest.onHeadersReceived.hasListener(this.onHeadersReceivedListener)) {
      browser.webRequest.onHeadersReceived.removeListener(this.onHeadersReceivedListener);
      browser.webRequest.onBeforeRedirect.removeListener(this.onBeforeRedirectListener);
      browser.webRequest.onResponseStarted.removeListener(this.onResponseStartedListener);
    }

    // we don't need to add any listeners if we're not yet monitoring any hosts
    if (hosts === null) { return; }
    if (hosts.size === 0) { return; }

    // listen for all requests and inject a CSPRO header
    const urls = [];

    for (const host of hosts) {
      urls.push(`http://${host}/*`);
      urls.push(`https://${host}/*`);
      urls.push(`ws://${host}/*`);
      urls.push(`wss://${host}/*`);
    }

    browser.webRequest.onHeadersReceived.addListener(
      this.onHeadersReceivedListener,
      { urls },
      ['blocking', 'responseHeaders']);

    // TODO: make this more efficient?  Perhaps only listen if a tab is in hosts?
    browser.webRequest.onBeforeRedirect.addListener(
      this.onBeforeRedirectListener,
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] });

    browser.webRequest.onResponseStarted.addListener(
      this.onResponseStartedListener,
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'ftp://*/*'] });
  }


  clearState() {
    console.log('Laboratory: Clearing all local storage');
    this.state = this.defaultState();
  }


  async getLocalState() {
    // if state already exists, we can just return that
    if (this.state !== undefined) {
      return this.state;
    }

    let state = await localForage.getItem('state');
    if (state === null) {
      return this.defaultState();
    }

    // let's loop through state and make sure everything is there
    Object.entries(this.defaultState()).forEach(([key, value]) => {
      if (!(key in state)) {
        state[key] = value;
      }

      // and loop through subkeys as well -- maybe this could use recursion
      // eventually; or we could just not nest any deeper than this
      if (typeof value === 'object') {
        Object.entries(value).forEach(([subkey, subvalue]) => {
          if (!(subkey in state[key])) {
            state[key][subkey] = subvalue;
          }
        });
      }
    });

    return state;
  }


  setState(state) {
    this.state = state;
  }


  writeLocalState() {
    return localForage.setItem('state', this.state);
  }


  async responseMonitor(details) {
    // get information about the current tab
    const tab = await browser.tabs.get(details.tabId);

    // get the hostname of the subresource via its tabId
    const a = new URL(details.url);
    let host;

    // extract the upper level hostname
    if (details.documentUrl !== undefined) {
      host = extractHostname(details.documentUrl);
    } else {
      host = extractHostname(tab.url);
    }

    // if we're enforcing/custom and/or incognito, don't record
    // also don't record if the TLD isn't in the recording list
    if (this.state.config.customcspHosts.includes(host)
      || this.state.config.enforcedHosts.includes(host)
      || !this.state.config.recordingHosts.includes(host)
      || tab.incognito) {
      return false;
    }

    // ignore requests that are for things that CSP doesn't deal with  --> other: fetch?
    if (['main_frame', 'beacon', 'csp_report', 'other'].includes(details.type)) {
      return false;
    }

    // for requests that have a frameId (eg iframes), we only want to record them if they're
    // a sub_frame request; all of the frame's resources are sandboxed as far as CSP goes
    if (details.frameId !== 0 && details.type !== 'sub_frame') {
      return false;
    }

    // throw an error to the console if we see a request type that we don't know
    if (!(details.type in Lab.typeMapping)) {
      console.error('Error: Unknown request type encountered', details);
      return false;
    }

    // add the host to the records, if it's not already there
    const records = this.state.records;
    if (!(host in records)) {
      records[host] = this.siteTemplate();
    }

    // add the item to the records that we've seen
    records[host][this.typeMapping[details.type]].push(a.origin + a.pathname);
    return true;
  }

  buildCsp(host) {
    const a = document.createElement('a');
    let csp = 'default-src \'none\';';
    let directive;
    let path;
    let sources;

    // build the CSP based on the strictness settings set
    const strictness = this.state.config.strictness;

    // first, we need to construct a shadow CSP that contains directives by strictness
    const shadowCSP = this.siteTemplate();

    // get the record for our host
    const records = this.state.records;

    // a handful of sites are completely immune to extensions that do the sort of thing we're doing
    if (this.unmonitorableSites.includes(host)) {
      return {
        text: '😭  Security controls prevent monitoring  😭',
        records: shadowCSP,
      };
    }

    // if it's a host we don't have records for, let's just return default-src 'none'
    if (!(host in records)) {
      return {
        text: csp.slice(0, -1),
        records: shadowCSP,
      };
    }

    Object.entries(records[host]).forEach(entry => {
      directive = entry[0];
      sources = entry[1];

      // now we need to iterate over each source and munge it
      sources.forEach(source => {
        let mungedSource;
        a.href = source;

        switch (strictness[directive]) {
          case 'origin':
            if (a.host === host) {
              mungedSource = '\'self\'';
            } else {
              mungedSource = a.origin;
            }
            break;
          case 'self-if-same-origin-else-directory':
            if (a.host === host) {
              mungedSource = '\'self\'';
              break;
            }
            // falls through
          case 'directory':
            path = a.pathname.split('/');
            path.pop();
            mungedSource = `${a.origin}${path.join('/')}/`;
            break;
          case 'self-if-same-origin-else-path':
            if (a.host === host) {
              mungedSource = '\'self\'';
              break;
            }
            // falls through
          case 'path':
            mungedSource = a.href;
            break;
          default:
            break;
        }

        // if it's a special case, we don't do processing
        if (['\'unsafe-eval\'', '\'unsafe-inline\'', 'data:'].includes(source)) {
          mungedSource = source;
        }

        // now we simply add the entry to the shadowCSP, if it's not already there
        if (!shadowCSP[directive].includes(mungedSource)) {
          shadowCSP[directive].push(mungedSource);
        }
      });
    });


    // compile together a new CSP policy
    Object.keys(shadowCSP).sort().forEach(key => {
      directive = key;
      sources = shadowCSP[directive].sort();

      if (sources.length > 0) {
        csp = `${csp} ${directive} ${sources.join(' ')};`;
      }
    });

    // return our resolved CSP without the trailing semicolon
    // also return the shadow CSP if needed
    return {
      text: csp.slice(0, -1),
      records: shadowCSP,
    };
  }


  async ingestCspReport(request) {
    const cancel = { cancel: true };
    const decoder = new TextDecoder('utf8');
    const records = this.state.records;

    // parse the CSP report
    const report = JSON.parse(decoder.decode(request.requestBody.raw[0].bytes))['csp-report'];
    const directive = report['violated-directive'].split(' ')[0];
    const host = extractHostname(report['document-uri']);
    let uri = report['blocked-uri'];

    // sometimes when things inject into the DOM, the blocked uri returns weird values
    // lets simply return if that's the case
    if (!uri && uri !== '') {
      return false;
    }

    // catch the special cases (data, unsafe)
    switch (uri) {
      case 'self':
      case 'inline':
      case '':
        uri = '\'unsafe-inline\'';  // boo
        break;
      case 'data':
        uri = 'data:';
        break;
      default:
        break;
    }

    // add the host to the records, if it's not already there
    if (!(host in records)) {
      records[host] = this.siteTemplate();
    }

    // add the uri to the resources for that directive
    // don't record if we're currently enforcing or have a custom CSP
    if (!records[host][directive].includes(uri)
      && !this.state.config.customcspHosts.includes(host)
      && !this.state.config.enforcedHosts.includes(host)) {
      records[host][directive].push(uri);
    }

    return cancel;
  }


  async injectCspHeader(request) {
    // Remove any existing CSP directives
    Lab.removeHttpHeaders(request.responseHeaders, ['content-security-policy', 'content-security-policy-report-only']);

    // prevent CSP header caching due to the Firefox extension architecture
    if (request.documentUrl === undefined) {
      Lab.removeHttpHeaders(request.responseHeaders, ['cache-control', 'expires']);

      request.responseHeaders.push({
        name: 'Cache-Control',
        value: 'no-cache, no-store, must-revalidate',
      });

      request.responseHeaders.push({
        name: 'Expires',
        value: new Date().toUTCString(),
      });
    }

    // get the request host name
    const host = extractHostname(request.url);

    // use the manually set CSP policy
    if (this.state.config.customcspHosts.includes(host)) {
      request.responseHeaders.push({
        name: 'Content-Security-Policy',
        value: this.state.config.customcspRecords[host],
      });
    }
    // if we're in enforcement mode, we inject an actual CSP header
    else if (this.state.config.enforcedHosts.includes(host)) {
      request.responseHeaders.push({
        name: 'Content-Security-Policy',
        value: this.buildCsp(host).text,
      });
    } else {
      // otherwise, we inject a fake report-only header
      // this tells the browser to block all non-network requests in report only mode
      request.responseHeaders.push({
        name: 'Content-Security-Policy-Report-Only',
        value: 'default-src \'none\'; connect-src http: https: ws: wss: ftp:; font-src http: https: ws: wss: ftp:; frame-src http: https: ws: wss: ftp:; img-src http: https: ws: wss: ftp:; media-src http: https: ws: wss: ftp:; object-src http: https: ws: wss: ftp:; script-src http: https: ws: wss: ftp:; style-src http: https: ws: wss: ftp:; report-uri /laboratory-fake-csp-report',
      });
    }

    return { responseHeaders: request.responseHeaders };
  }
}


console.log('Laboratory: Initializing');
const lab = new Lab();
lab.getLocalState().then(state => lab.setState(state)).then(() => {
  // expose state to the popup
  Object.assign(window, {
    Lab: lab,
  });

  // we don't add/remove the ingester, simply because if it was in the midst of being
  // toggled, it would send fake 404 requests to sites accidentally
  browser.webRequest.onBeforeRequest.addListener(
    request => lab.ingestCspReport(request),
    { urls: ['*://*/laboratory-fake-csp-report'] },
    ['blocking', 'requestBody']);

  lab.init();
});


/* Synchronize the local storage every time a page finishes loading */
browser.webNavigation.onCompleted.addListener(async () => {
  await lab.writeLocalState();
});
