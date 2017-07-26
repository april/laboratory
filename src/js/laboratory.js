class Lab {
  constructor() {
    this.defaultState = () => {
      return {
        config: {
          enforcedHosts: [],
          hosts: [],  // list of hosts to monitor
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
    this.extractHostname = Lab.extractHostname;
    this.removeHttpHeaders = Lab.removeHttpHeaders;
    this.typeMapping = Lab.typeMapping;
    this.unmonitorableSites = Lab.unmonitorableSites;
  }


  static extractHostname(url) {
    const a = document.createElement('a');
    a.href = url;
    return a.host;
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
      font: 'font-src',
      image: 'img-src',
      imageset: 'img-src',
      media: 'media-src',
      object: 'object-src',
      other: 'connect-src',  // fetch?
      script: 'script-src',
      stylesheet: 'style-src',
      sub_frame: 'frame-src',
      websocket: 'connect-src',
      xbl: 'style-src',
      xmlhttprequest: 'connect-src',
      xslt: 'style-src',
    };
  }


  static get unmonitorableSites() {
    return [
      'addons.mozilla.org',
      'discovery.addons.mozilla.org',
      'testpilot.firefox.com',
    ];
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
    const hosts = this.state.config.hosts;
    // we create a listeners here to inject CSPRO headers
    // we define it globally so that we don't have to keep recreating anonymous functions,
    // which has the side effect of making it much easier to remove the listener
    if (this.onHeadersReceivedListener === undefined) {
      this.onHeadersReceivedListener = request => this.injectCspHeader(request);
      this.onResponseStartedListener = request => this.responseMonitor(request);
    }

    // delete the old listeners, if we're listening
    if (browser.webRequest.onHeadersReceived.hasListener(this.onHeadersReceivedListener)) {
      browser.webRequest.onHeadersReceived.removeListener(this.onHeadersReceivedListener);
      browser.webRequest.onResponseStarted.removeListener(this.onResponseStartedListener);
    }

    // we don't need to add any listeners if we're not yet monitoring any hosts
    if (hosts === null) { return; }
    if (hosts.length === 0) { return; }

    // listen for all requests and inject a CSPRO header
    const urls = [];

    for (const host of hosts) {
      urls.push(`http://${host}/*`);
      urls.push(`https://${host}/*`);
    }

    browser.webRequest.onHeadersReceived.addListener(
      this.onHeadersReceivedListener,
      { urls },
      ['blocking', 'responseHeaders']);

    // TODO: make this more efficient?  Perhaps only listen if a tab is in hosts?
    browser.webRequest.onResponseStarted.addListener(
      this.onResponseStartedListener,
      { urls: ['http://*/*', 'https://*/*', 'ftp://*/*'] });
  }


  clearState() {
    console.log('Laboratory: Clearing all local storage');
    this.state = this.defaultState();
  }


  getLocalState() {
    return new Promise((resolve, reject) => {
      // if state already exists, we can just return that
      if (this.state !== undefined) {
        return resolve(this.state);
      }

      localforage.getItem('state').then(state => {
        if (state === null) {
          return resolve(this.defaultState());
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

        return resolve(state);
      });
    });
  }


  setState(state) {
    this.state = state;
  }


  writeLocalState() {
    return localforage.setItem('state', this.state);
  }


  responseMonitor(details) {
    return new Promise((resolve, reject) => {
      // get the hostname of the subresource via its tabId
      browser.tabs.get(details.tabId).then(t => {
        const host = Lab.extractHostname(t.url);
        const hosts = this.state.config.hosts;
        const records = this.state.records;

        // if it isn't a monitored url, we're enforcing, or it's an incognito tab, let's just bail
        if (!hosts.includes(host) ||
          this.state.config.enforcedHosts.includes(host) ||
          t.incognito) {
          return reject(false);
        }

        // ignore requests that are for things that CSP doesn't deal with  --> other: fetch?
        if (['main_frame', 'beacon', 'csp_report', 'other'].includes(details.type)) {
          return reject(false);
        }

        // for requests that have a frameId (eg iframes), we only want to record them if they're
        // a sub_frame request; all of the frame's resources are sandboxed as far as CSP goes
        if (details.frameId !== 0 && details.type !== 'sub_frame') {
          return reject(false);
        }

        // and store the url
        const a = document.createElement('a');
        a.href = details.url;

        // throw an error to the console if we see a request type that we don't know
        if (!(details.type in Lab.typeMapping)) {
          console.error('Error: Unknown request type encountered', details);
          reject(false);
        }

        // add the host to the records, if it's not already there
        if (!(host in records)) {
          records[host] = this.siteTemplate();
        }

        // add the item to the records that we've seen
        records[host][this.typeMapping[details.type]].push(a.origin + a.pathname);
        resolve(true);
      });

      resolve(true);
    });
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


  ingestCspReport(request) {
    return new Promise((resolve, reject) => {
      const cancel = { cancel: true };
      const decoder = new TextDecoder('utf8');
      const records = this.state.records;

      // parse the CSP report
      const report = JSON.parse(decoder.decode(request.requestBody.raw[0].bytes))['csp-report'];
      const directive = report['violated-directive'].split(' ')[0];
      const host = Lab.extractHostname(report['document-uri']);
      let uri = report['blocked-uri'];

      // catch the special cases (data, unsafe)
      switch (uri) {
        case 'self':
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
      // don't record if we're currently enforcing
      if (!(records[host][directive].includes(uri))
        && !(this.state.config.enforcedHosts.includes(host))) {
        records[host][directive].push(uri);
      }

      return resolve(cancel);
    });
  }


  injectCspHeader(request) {
    return new Promise((resolve, reject) => {
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
      const host = Lab.extractHostname(request.url);

      // if we're in enforcement mode, we inject an actual CSP header
      if (this.state.config.enforcedHosts.includes(host)) {
        request.responseHeaders.push({
          name: 'Content-Security-Policy',
          value: this.buildCsp(host).text,
        });
      } else {
        // otherwise, we inject a fake report-only header
        // this tells the browser to block all non-network requests in report only mode
        request.responseHeaders.push({
          name: 'Content-Security-Policy-Report-Only',
          value: 'default-src \'none\'; connect-src http: https: ftp:; font-src http: https: ftp:; frame-src http: https: ftp:; img-src http: https: ftp:; media-src http: https: ftp:; object-src http: https: ftp:; script-src http: https: ftp:; style-src http: https: ftp:; report-uri /laboratory-fake-csp-report',
        });
      }

      return resolve({ responseHeaders: request.responseHeaders });
    });
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
browser.webNavigation.onCompleted.addListener(() => {
  lab.writeLocalState().then();
});
