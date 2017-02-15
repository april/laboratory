class Lab {
  constructor() {
    this.queue = {};

    this.strictness = {
      'connect-src': 'origin',
      'font-src': 'origin',
      'frame-src': 'origin',
      'img-src': 'origin',
      'media-src': 'origin',
      'object-src': 'path',
      'script-src': 'self-if-same-origin-else-path',
      'style-src': 'self-if-same-origin-else-folder',
    };

    this.typeMapping = {
      font: 'font-src',
      image: 'img-src',
      media: 'media-src',
      object: 'object-src',
      script: 'script-src',
      stylesheet: 'style-src',
      sub_frame: 'frame-src',
      xmlhttprequest: 'connect-src',
    };
  }

  extractHostname(url) {
    const a = document.createElement('a');
    a.href = url;
    return a.host;
  }

  siteTemplate() {
    const site = {};
    Object.values(this.typeMapping).map((x) => {
      site[x] = [];
      return undefined;
    });

    return site;
  }

  buildCSP(host) {
    const a = document.createElement('a');
    let csp = 'default-src \'none\';';
    let path;
    let shadowCSP = this.siteTemplate();  // first, we need to construct a shadow CSP that contains directives by strictness

    // get the record for our host
    this.get().then((records) => {
      Object.entries(records[host]).forEach((entry) => {
        const directive = entry[0];
        const sources = entry[1];

        // get the strictness for a given category
        const strict = this.strictness[directive];

        // now we need to iterate over each source and munge it
        sources.forEach((source) => {
          let mungedSource;
          a.href = source;

          switch (strict) {
            case 'origin':
              if (a.host === host) {
                mungedSource = '\'self\'';
              } else {
                mungedSource = a.origin;
              }
              break;
            case 'self-if-same-origin-else-folder':
              if (a.host === host) {
                mungedSource = '\'self\'';
                break;
              }
              // falls through
            case 'folder':
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

          // now we simply add the entry to the shadowCSP, if it's not already there
          if (!shadowCSP[directive].includes(mungedSource)) {
            shadowCSP[directive].push(mungedSource);
          }
        });
      });

      // compile together a new CSP policy
      Object.keys(shadowCSP).sort().forEach((key) => {
        const directive = key;
        const sources = shadowCSP[directive].sort();

        if (sources.length > 0) {
          csp = `${csp} ${directive} ${sources.join(' ')};`;
        }
      });

      // strip off the trailing semicolon
      csp = csp.slice(0, -1);
      console.log('new csp is', csp);
    });
  }

  get() {
    return localforage.getItem('records');
  }

  initGlobalStorage() {
    // clear the local storage -- clear this later
    localforage.clear().then(() => {
      console.log('Local storage has been cleared');
    }).catch((err) => {
      console.error(err);
    });

    // initialize the records entry, if it's not already there
    this.get().then((records) => {
      console.log('records is', records);
      if (records === null) {
        this.set({}).then(() => {
          console.log('Initialized records to {}')
        }).catch((err) => {
          console.error(err);
        })
      }
    }).catch((err) => {
      console.log(err);
    })
  }

  requestMonitor(details) {
    console.log('this is', this);
    console.log('details is this', details);
    // ignore main_frame requests, that's just the primary request (not a subresource)
    // also ignore csp_report requests, as they're not sources
    if (['main_frame', 'csp_report'].includes(details.type)) {
      return;
    }

    // get the hostname of the subresource via its tabId
    browser.tabs.get(details.tabId).then((t) => {
      const host = this.extractHostname(t.url);

      // and store the url
      const a = document.createElement('a');
      a.href = details.url;

      // throw an error to the console if we see a request type that we don't know
      if (!(details.type in this.typeMapping)) {
        console.error('Error: Unknown request type encountered', details);
        return;
      }

      // add the item to the queue
      this.queue[details.requestId] = [host, this.typeMapping[details.type], a.origin + a.pathname];
    });
  }

  set(records) {
    return localforage.setItem('records', records);
  }

  sync() {
    console.log('Initiating synchronization process');
    this.get().then((records) => {

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

        if (!(url in records[host][directive])) {
          records[host][directive].push(url);
        }
      });

      // now lets write the records back
      this.set(records).then(() => {
        console.log('successfully wrote records back', records);
      }).catch((err) => {
        console.error('could not write records', records);
      });
    });

    // for debugging purposes, let's generate a CSP
    setTimeout(() => {
      this.buildCSP('addons.mozilla.org')
    }, 1000);
  }
}

console.log('Restarting Laboratory by Mozilla');

/* initialize the extension */
const lab = new Lab();
lab.initGlobalStorage();

/* let's begin the flaggelation */
browser.webRequest.onResponseStarted.addListener(details => lab.requestMonitor(details),
  { urls: ['https://*/*'] });  // TODO, configure this list

/* Synchronize the local storage every time a page finishes loading */
browser.webNavigation.onCompleted.addListener(details => lab.sync(details));
