import localForage from 'localforage';
import { defaultState, unmonitorableSites } from './static';
import { extractHostname } from './utils';
import * as webRequest from './webrequest';

class Lab {
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
    Object.keys(defaultState().config.strictness).map(x => {
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
    }

    // delete the old listeners, if we're listening
    if (browser.webRequest.onHeadersReceived.hasListener(this.onHeadersReceivedListener)) {
      browser.webRequest.onHeadersReceived.removeListener(this.onHeadersReceivedListener);
    }

    // we don't need to add any listeners if we're not yet monitoring any hosts
    if (hosts === null) { return; }
    if (hosts.size === 0) { return; }

    // listen for all requests and inject a CSPRO header
    const urls = [];

    for (const host of hosts) {
      urls.push(`http://${host}/*`);
      urls.push(`https://${host}/*`);
      urls.push(`ftp://${host}/*`);
      urls.push(`ws://${host}/*`);
      urls.push(`wss://${host}/*`);
    }

    browser.webRequest.onHeadersReceived.addListener(
      this.onHeadersReceivedListener,
      { urls },
      ['blocking', 'responseHeaders']
    );
  }


  clearState() {
    console.log('Laboratory: Clearing all local storage');
    this.state = defaultState();
  }


  async getLocalState() {
    // if state already exists, we can just return that
    if (this.state !== undefined) {
      return this.state;
    }

    let state = await localForage.getItem('state');
    if (state === null) {
      return defaultState();
    }

    // let's loop through state and make sure everything is there
    Object.entries(defaultState()).forEach(([key, value]) => {
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


  buildCsp(host) {
    let uri;
    let cspHtml = '<strong>default-src</strong> \'none\';';
    let cspText = 'default-src \'none\';';
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
    if (unmonitorableSites.includes(host)) {
      return {
        html: '😭  Security controls prevent monitoring  😭',
        text: '😭  Security controls prevent monitoring  😭',
        records: shadowCSP,
      };
    }

    // if it's a host we don't have records for, let's just return default-src 'none'
    if (!(host in records)) {
      return {
        html: cspHtml.slice(0, -1),
        text: cspText.slice(0, -1),
        records: shadowCSP,
      };
    }

    Object.entries(records[host]).forEach(entry => {
      directive = entry[0];
      sources = entry[1];

      // now we need to iterate over each source and munge it
      sources.forEach(source => {
        let mungedSource;

        // if it's a special case, we don't do processing - ws: and wss: are Firefox bugs
        if (['\'unsafe-eval\'', '\'unsafe-inline\'', 'data:', 'ws:', 'wss:'].includes(source)) {
          mungedSource = source;
        } else {
          uri = new URL(source);

          switch (strictness[directive]) {
            case 'origin':
              if (uri.host === host) {
                mungedSource = '\'self\'';
              } else {
                mungedSource = uri.origin;
              }
              break;
            case 'self-if-same-origin-else-directory':
              if (uri.host === host) {
                mungedSource = '\'self\'';
                break;
              }
              // falls through
            case 'directory':
              path = uri.pathname.split('/');
              path.pop();
              mungedSource = `${uri.origin}${path.join('/')}/`;
              break;
            case 'self-if-same-origin-else-path':
              if (uri.host === host) {
                mungedSource = '\'self\'';
                break;
              }
              // falls through
            case 'path':
              mungedSource = uri.href;
              break;
            default:
              break;
          }
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
        cspHtml = `${cspHtml} <br />&nbsp;&nbsp;<strong>${directive}</strong> ${sources.join(' ')};`;
        cspText = `${cspText} ${directive} ${sources.join(' ')};`;
      }
    });

    // return our resolved CSP without the trailing semicolon
    // also return the shadow CSP if needed
    return {
      html: cspHtml.slice(0, -1),
      text: cspText.slice(0, -1),
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
      case 'eval':
        uri = '\'unsafe-eval\'';
        break;
      case 'data':
        uri = 'data:';
        break;
      case 'ws':  // currently broken, see: https://bugzilla.mozilla.org/show_bug.cgi?id=1505178
        uri = 'ws:';
        break;
      case 'wss': // also broken
        uri = 'wss:';
        break;
      default:
        uri = new URL(uri);
        uri = uri.pathname === '/' ? uri.origin : uri.origin + uri.pathname;
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
    webRequest.removeHeaders(request.responseHeaders, ['content-security-policy', 'content-security-policy-report-only']);

    // prevent CSP header caching due to the Firefox extension architecture
    if (request.documentUrl === undefined) {
      webRequest.removeHeaders(request.responseHeaders, ['cache-control', 'expires']);

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
        value: 'default-src \'none\'; form-action \'none\'; connect-src \'none\'; font-src \'none\'; frame-src \'none\'; img-src \'none\'; manifest-src \'none\'; media-src \'none\'; object-src \'none\'; prefetch-src \'none\'; script-src \'none\'; style-src \'none\'; worker-src \'none\'; report-uri /laboratory-fake-csp-report',
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
