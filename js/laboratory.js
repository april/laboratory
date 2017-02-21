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


  static get typeMapping() {
    return {
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

  static extractHostname(url) {
    const a = document.createElement('a');
    a.href = url;
    return a.host;
  }

  static get siteTemplate() {
    const site = {};
    Object.values(Lab.typeMapping).map((x) => {
      site[x] = [];
      return undefined;
    });

    return site;
  }

  static read(key) {
    return localforage.getItem(key);  // returns a promise
  }

  initStorage(clear = false) {
    // clear the local storage -- clear this later
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

  requestMonitor(details) {
    console.log(details);
    // ignore requests that are for things that CSP doesn't deal with
    if (['main_frame', 'beacon', 'csp_report'].includes(details.type)) {
      return;
    }

    // for requests that have a frameId (eg iframes), we only want to record them if they're
    // a sub_frame request; all of the frame's resources are sandboxed as far as CSP goes
    if (details.frameId !== 0 && details.type !== 'sub_frame') {
      return;
    }

    // get the hostname of the subresource via its tabId
    browser.tabs.get(details.tabId).then((t) => {
      const host = Lab.extractHostname(t.url);

      // and store the url
      const a = document.createElement('a');
      a.href = details.url;

      // throw an error to the console if we see a request type that we don't know
      if (!(details.type in Lab.typeMapping)) {
        console.error('Error: Unknown request type encountered', details);
        return;
      }

      // add the item to the queue
      this.queue[details.requestId] = [host, Lab.typeMapping[details.type], a.origin + a.pathname];
    });
  }

  storageMonitor(changes, area) {
    console.log('storage was changed', changes, area);
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
          records[host] = Lab.siteTemplate;
        }

        if (!(url in records[host][directive])) {
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

console.log('Initializing Laboratory popup');

/* initialize the extension */
const lab = new Lab();
lab.initStorage();

/* let's begin the flaggelation */
browser.webRequest.onResponseStarted.addListener(details => lab.requestMonitor(details),
  { urls: ['https://*/*'] });  // TODO, configure this list

/* Synchronize the local storage every time a page finishes loading */
browser.webNavigation.onCompleted.addListener(() => lab.sync());
