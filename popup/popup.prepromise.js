browser.tabs.query({
  active: true,
  currentWindow: true,
}).then((tab) => {
  console.log(tab[0]);
});

Lab.read('records').then((records) => {
  console.log('current records are', records);
});


const buildCSP = function buildCSP(host) {
  const a = document.createElement('a');
  let csp = 'default-src \'none\';';
  let path;

  // first, we need to construct a shadow CSP that contains directives by strictness
  const shadowCSP = this.siteTemplate();

  // get the record for our host
  Lab.read('records').then((records) => {
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
    console.log(`Suggested CSP for ${host} is`, csp);
  });
};

const getCurrentTabHost = function getCurrentTab(args, callback) {
  browser.tabs.query({
    active: true,
    currentWindow: true,
  }).then(tab => callback(args, Lab.extractHostname(tab[0].url)));
};

const setToggleOnContentLoaded = function setToggleOnContentLoaded(enable) {

};

const toggleRecord = function toggleRecord(enable, host) {
  Lab.read('hosts').then((hosts) => {
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
      const i = hosts.indexOf(host);
      hosts.splice(i, 1);
    }

    // now we write the hosts list back
    Lab.write('hosts', hosts).then(() => {
      console.log('Successfully updated hosts to ', hosts);
    }).catch((err) => {
      console.log(err);
    });
  });
};


/* set up our event listeners */
document.addEventListener('DOMContentLoaded', () => {
  console.log('enabling toggle switches');
  $('#toggle-csp-record').bootstrapToggle();

  // set the correct tab state
  getCurrentTabHost()

  // set a listener for toggling for a site
  $('#toggle-csp-record').change(event => getCurrentTabHost(event.target.checked, toggleRecord));
});
