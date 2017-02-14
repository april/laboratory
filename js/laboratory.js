const Lab = {
  strictness: {
    'connect-src': 'origin',
    'font-src': 'origin',
    'frame-src': 'origin',
    'img-src': 'origin',
    'media-src': 'origin',
    'object-src': 'path',
    'script-src': 'self-if-same-origin-else-path',
    'style-src': 'self-if-same-origin-else-folder',
  },

  typeMapping: {
    font: 'font-src',
    image: 'img-src',
    media: 'media-src',
    object: 'object-src',
    script: 'script-src',
    stylesheet: 'style-src',
    sub_frame: 'frame-src',
    xmlhttprequest: 'connect-src',
  },

  extractHostname(url) {
    const a = document.createElement('a');
    a.href = url;
    return a.host;
  },

  buildCSP(host) {
//    const csp = 'default-src \'none\'; ';
    return;
    const a = document.createElement('a');
    let csp = 'default-src \'none\';';
    let path;

    // first, we need to construct a shadow CSP that contains the condensed version
    const shadowCSP = {};

    const s = browser.storage.local.get('records');
    console.log(s);

//    Object.entries(Lab.cspRecords[host]).forEach((kv) => {
    browser.storage.local.get('records').then((records) => {
      console.log(records);
    });
    // browser.storage.local.get('records')[host].forEach((kv) => {
    //   const k = kv[0];
    //   const v = kv[1];

    //   shadowCSP[k] = new Set();

    //   Array.from(v).forEach((url) => {
    //     const strict = Lab.strictness[k];
    //     a.href = url;

    //     // look up the strictness of various things
    //     switch (strict) {
    //       case 'origin':
    //         if (a.host === host) {
    //           shadowCSP[k].add('\'self\'');
    //         } else {
    //           shadowCSP[k].add(a.origin);
    //         }
    //         break;
    //       case 'self-if-same-origin-else-folder':
    //         if (a.host === host) {
    //           shadowCSP[k].add('\'self\'');
    //           break;
    //         }
    //         // falls through
    //       case 'folder':
    //         path = a.pathname.split('/');
    //         path.pop();
    //         shadowCSP[k].add(`${a.origin}${path.join('/')}/`);
    //         break;
    //       case 'self-if-same-origin-else-path':
    //         if (a.host === host) {
    //           shadowCSP[k].add('\'self\'');
    //           break;
    //         }
    //         // falls through
    //       case 'path':
    //         shadowCSP[k].add(a.href);
    //         break;
    //       default:
    //         break;
    //     }
    //   });
    // });

    // compile together a new CSP policy
    Object.keys(Lab.strictness).sort().forEach((k) => {
      const directive = k;
      const sources = Array.from(shadowCSP[k]).sort();

      if (sources.length > 0) {
        csp = `${csp} ${directive} ${sources.join(' ')};`;
      }
    });

    // strip off the trailing semicolon
    csp = csp.slice(0, -1);
    console.log('new csp is', csp);
  },

  init() {
    browser.storage.local.get('records').then((storage) => {
      console.log('initializing new storage');
      if (storage.records !== undefined) {  // TODO this always wipes at the beginning
        browser.storage.local.set({
          records: {},
        });
      }
    });
  },

  // initializeSite(details) {
  //   const host = Lab.extractHostname(details.url);

  //   // initialize each host's storage to a bunch of empty sets
  //   if (!(host in Lab.cspRecords)) {
  //     Lab.cspRecords[host] = {};
  //     Object.values(Lab.typeMapping).map((x) => {
  //       Lab.cspRecords[host][x] = new Set();
  //       return undefined;
  //     });
  //   }

  //   console.log('initialized');
  // },

  requestMonitor(details) {
    // ignore main_frame requests, that's just the primary request (not a subresource)
    if (details.type === 'main_frame') {
      return;
    }

    // get the hostname of the subresource via its tabId
    browser.tabs.get(details.tabId).then((t) => {
      const host = Lab.extractHostname(t.url);

      // and store the url
      const a = document.createElement('a');
      a.href = details.url;

      // store their record
      Lab.write(host, Lab.typeMapping[details.type], a.origin + a.pathname);

      // Lab.cspRecords[host][Lab.typeMapping[details.type]].add(a.origin + a.pathname);
      Lab.buildCSP(host);
    });
  },

  write(host, directive, source) {
    // Let's read/write the current value to the local storage
    browser.storage.local.get('records').then((storage) => {
      console.log('reading record', storage.records);

      // if it's new site we haven't seen before, let's create a blank record
      if (!(host in storage.records)) {
        storage.records[host] = {};
        Object.values(Lab.typeMapping).map((x) => {
          storage.records[host][x] = new Set();
          return undefined;
        });
      }

      console.log('adding the directive in', storage.records[host]);
      // add the directive in
      storage.records[host][directive].add(source);

      console.log('writing record', storage.records);

      // write the record back
      browser.storage.local.set({records: storage.records});

      // read the storage back
      browser.storage.local.get('records').then((s) => {
        console.log('updated storage is', s);
      });
    });
  },
};

/* initialize the extension */
console.log('Restarting Laboratory by Mozilla');
Lab.init();

/* let's begin the flaggelation */
browser.webRequest.onResponseStarted.addListener(Lab.requestMonitor,
  { urls: ['https://*/*'] });  // TODO, configure this list

// browser.webNavigation.onBeforeNavigate.addListener(Lab.initializeSite);
