class Lab {
  constructor() {
    this.defaultStorage = {
      config: {
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
      hosts: [],  // list of hosts to monitor
      records: {},  // hosts -> sources mapping
    };

    this.listeners = [];
    this.queue = {};
  }


  // TODO: make this configurable
  static get strictness() {
    return {
      'connect-src': 'origin',
      'font-src': 'origin',
      'frame-src': 'origin',
      'img-src': 'origin',
      'media-src': 'origin',
      'object-src': 'path',
      'script-src': 'self-if-same-origin-else-path',
      'style-src': 'self-if-same-origin-else-directory',
    };
  }


  static get strictnessDefs() {
    return {
      directory: 'Directory',
      origin: 'Origin',
      path: 'Full path to resource',
      'self-if-same-origin-else-directory': '\'self\' if same origin, otherwise directory',
      'self-if-same-origin-else-path': '\'self\' if same origin, otherwise full path',
    };
  }


  static extractHostname(url) {
    const a = document.createElement('a');
    a.href = url;
    return a.host;
  }


  siteTemplate() {
    const site = {};
    Object.keys(this.defaultStorage.config.strictness).map((x) => {
      site[x] = [];
      return undefined;
    });

    return site;
  }


  static read(key) {
    return localforage.getItem(key);  // returns a promise
  }


  init(hosts) {
    let listener;

    console.log('current hosts list is ', hosts);
    // delete all the old listeners
    if (browser.webRequest.onHeadersReceived.hasListener(lab.injectCspReportOnlyHeader)) {
      console.log('removing listener a');
      browser.webRequest.onHeadersReceived.removeListener(lab.injectCspReportOnlyHeader);
    }
    if (browser.webRequest.onBeforeRequest.hasListener(lab.ingestCspReport)) {
      console.log('removing listener b');
      browser.webRequest.onBeforeRequest.removeListener(lab.ingestCspReport);
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

    // listener = request => this.injectCspReportOnlyHeader(request);
    browser.webRequest.onHeadersReceived.addListener(
      lab.injectCspReportOnlyHeader,
      { urls: urls },
      ['blocking', 'responseHeaders']);

    browser.webRequest.onBeforeRequest.addListener(
      lab.ingestCspReport,
      { urls: ['*://*/laboratory-fake-csp-report'] },
      ['blocking', 'requestBody']);

    console.log('Laboratory monitoring the following URLs:', urls.join(', '));
  }


  initStorage(clear = false) {
    if (clear) {
      localforage.clear().then(() => {
        console.log('Local storage has been cleared');
      }).catch((err) => {
        console.error(err);
      });
    }

    // set the default values, if they're not already set
    Object.entries(this.defaultStorage).forEach((ds) => {
      const key = ds[0];  // simply for clarity
      const defaultValue = ds[1];

      Lab.read(key).then((value) => {
        if (value === null) { // unset in local forage
          Lab.write(key, defaultValue).then(() => {
            console.log(`Initialized ${key} to ${JSON.stringify(defaultValue)}`);
          }).catch((err) => {
            console.error(err);
          });
        }
      });
    });
  }


  ingestCspReport(request) {
    return new Promise((resolve, reject) => {
      const cancel = { cancel: true };
      const decoder = new TextDecoder('utf8');
      const report = JSON.parse(decoder.decode(request.requestBody.raw[0].bytes))['csp-report'];

      const host = Lab.extractHostname(report['document-uri']);
      let uri = report['blocked-uri'];
      const directive = report['violated-directive'].split(' ')[0];

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

      this.queue[request.requestId] = [host, directive, uri];
      return resolve(cancel);
    });
  }


  injectCspReportOnlyHeader(request) {
    console.log('injecting a cspro header');
    return new Promise((resolve, reject) => {
      // todo: remove an existing CSP
      let i = request.responseHeaders.length;
      while (i > 0) {
        i -= 1;
        if (['content-security-policy', 'content-security-policy-report-only'].includes(request.responseHeaders[i].name.toLowerCase())) {
          request.responseHeaders.splice(i, 1);
        }
      }

      // push a response header onto the stack to block all requests in report only mode
      request.responseHeaders.push({
        name: 'Content-Security-Policy-Report-Only',
        value: 'default-src \'none\'; connect-src \'none\'; font-src \'none\'; frame-src \'none\'; img-src \'none\'; media-src \'none\'; object-src \'none\'; script-src \'none\'; style-src \'none\'; report-uri /laboratory-fake-csp-report',
      });

      return resolve({ responseHeaders: request.responseHeaders });
    });
  }


  static write(key, value) {
    return localforage.setItem(key, value);  // returns a promise
  }


  sync() {
    console.info('Initiating synchronization process');
    Lab.read('records').then((records) => {
      // for each item in the queue, we need to add it into records
      Object.entries(this.queue).forEach((requests) => {
        delete this.queue[requests[0]];  // dequeue the entry

        const host = requests[1][0];
        const directive = requests[1][1];
        const url = requests[1][2];

        // initialize to a blank CSP if it's the first time we've seen the site
        if (!(host in records)) {
          records[host] = this.siteTemplate();
        }

        if (!(records[host][directive].includes(url))) {
          records[host][directive].push(url);
        }
      });

      // now lets write the records back
      Lab.write('records', records).then(() => {
        console.info('Successfully sychronized records', records);
      }).catch((err) => {
        console.error('Unable to write records to local storage', err);
      });
    });
  }
}

console.log('Initializing Laboratory');

/* initialize the extension */
const lab = new Lab();
lab.initStorage();
Lab.read('hosts').then((hosts) => { lab.init(hosts); });

/* Synchronize the local storage every time a page finishes loading */
browser.webNavigation.onCompleted.addListener(() => lab.sync());
