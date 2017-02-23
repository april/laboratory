const buildCSP = (host) => {
  const a = document.createElement('a');
  let csp = 'default-src \'none\';';
  let directive;
  let path;
  let sources;

  // build the CSP based on the strictness settings set
  const strictness = window.Lab.state.config.strictness;

  // first, we need to construct a shadow CSP that contains directives by strictness
  const shadowCSP = window.Lab.siteTemplate();

  // get the record for our host
  const records = window.Lab.state.records;

  // a handful of sites are completely immune to extensions that do the sort of thing we're doing
  if (window.Lab.unmonitorableSites.includes(host)) {
    return '😭  Security controls prevent monitoring  😭';
  }

  // if it's a host we don't have records for, let's just return default-src 'none'
  if (!(host in records)) {
    return csp.slice(0, -1);
  }

  Object.entries(records[host]).forEach((entry) => {
    directive = entry[0];
    sources = entry[1];

    // now we need to iterate over each source and munge it
    sources.forEach((source) => {
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
  Object.keys(shadowCSP).sort().forEach((key) => {
    directive = key;
    sources = shadowCSP[directive].sort();

    if (sources.length > 0) {
      csp = `${csp} ${directive} ${sources.join(' ')};`;
    }
  });

  // return our resolved CSP without the trailing semicolon
  return csp.slice(0, -1);
};


const getCurrentTabHost = () => {
  return new Promise((resolve, reject) => {
    browser.tabs.query({
      active: true,
      currentWindow: true,
    }).then(tab => resolve(Lab.extractHostname(tab[0].url)))
      .catch(err => reject(err));
  });
};


const insertCspConfig = () => {
  const strictness = window.Lab.state.config.strictness;

  // for each strictness level, we need to add a select for it
  Object.entries(strictness).forEach((kv) => {
    const directive = kv[0];
    const setting = kv[1];

    // set the proper value on the select
    document.getElementById(`csp-config-${directive}`).value = setting;
  });
};


const writeConfig = () => {
  return new Promise((resolve, reject) => {
    const strictness = window.Lab.state.config.strictness;

    // read in all the CSP config settings
    for (const row of document.getElementsByClassName('csp-form-control')) {
      strictness[row.getAttribute('data-directive')] = row.value;
    }

    resolve(strictness);
  });
};


const insertCSP = () => {
  // get the host for the current tab and then insert its CSP
  getCurrentTabHost().then((host) => {
    document.getElementById('csp-record').textContent = buildCSP(host);
  });
};


const determineToggleState = (host) => {  // TODO: make this more generic
  // get the list of current hosts and set the toggle to on if it's in there
  return new Promise((resolve, reject) => {
    const hosts = window.Lab.state.config.hosts;

    if (hosts.includes(host)) {
      return resolve(true);
    }

    return resolve(false);
  });
};


const toggleRecord = function toggleRecord(host, enable) {
  const hosts = window.Lab.state.config.hosts;
  const records = window.Lab.state.records;

  // lets bail if you try to toggle the host on a weird thing (like moz-extension://)
  if (!host) { return; }

  // if it's in the hosts list + enable -> move on
  // if it's not in the hosts list + disable -> move on
  // this shouldn't happen, but we're guarding against it anyways
  // also wtf does es6 not have a true logical xor operator?
  if ((hosts.includes(host)) ^ !enable) {
    console.error('Unexpected toggling for site encountered');
    return;
  }

  if (enable) {
    hosts.push(host);
  } else {
    // remove it from the list of monitored sites
    const i = hosts.indexOf(host);
    hosts.splice(i, 1);


    // remove any records for a site, if we have any
    if (host in records) {
      delete records[host];
    }
  }

  // now we reinitialize the listeners
  window.Lab.init();
};


/* bind to our backend window object */
browser.runtime.getBackgroundPage().then((winder) => {
  window.Lab = winder.Lab;
});


/* set up our event listeners */
document.addEventListener('DOMContentLoaded', () => {
  // retrieve a site's active status and check the box if its active
  getCurrentTabHost().then(host => determineToggleState(host)).then((state) => {
    $('#toggle-csp-record').prop('checked', state);
  }).then(() => {
    // set a listener for toggling for a site
    $('#toggle-csp-record').change((event) => {
      getCurrentTabHost().then(host => {
        toggleRecord(host, event.target.checked);
        window.Lab.writeLocalState().then(() => insertCSP());
      });
    });
  });

  // display the current CSP if we have one
  insertCSP();

  // insert the config pulldowns
  insertCspConfig();

  // initialize all our clipboards
  const clipboard = new Clipboard('.btn');

  // bind a listener for the trash icon to delete all records
  document.getElementById('btn-trash').addEventListener('click', () => {
    window.Lab.clearListeners();
    window.Lab.clearState();

    window.Lab.writeLocalState().then((state) => {
      $('#toggle-csp-record').prop('checked', false);  // unset checkbox
      window.Lab.init();
      insertCSP();
      insertCspConfig();
    });
  });


  // bind a listener for every time we change a config setting, TODO: make this more generic
  document.getElementById('csp-config').addEventListener('change', () => {
    writeConfig().then(() => {
      window.Lab.writeLocalState().then(() => insertCSP());
    });
  });
});
