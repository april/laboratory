import 'bootstrap-loader';
import '../../../node_modules/bootstrap-toggle/css/bootstrap-toggle.css';
import '../../../node_modules/bootstrap-toggle/js/bootstrap-toggle.js';
import '../css/popup.css';

const buildCSP = (host, strictness) => {
  return new Promise((resolve, reject) => {
    const a = document.createElement('a');
    let csp = 'default-src \'none\';';
    let path;

    // first, we need to construct a shadow CSP that contains directives by strictness
    console.log('lab is', Lab, 'host is', host, 'strictness is', strictness);
    const shadowCSP = Lab.siteTemplate;

    // get the record for our host
    Lab.read('records').then((records) => {
      // if it's a host we don't have records for, let's just return default-src 'none'
      if (!(host in records)) {
        return resolve(csp.slice(0, -1));
      }

      Object.entries(records[host]).forEach((entry) => {
        const directive = entry[0];
        const sources = entry[1];

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

      // return our resolved CSP
      return resolve(csp);
    });
  });
};


const getCurrentTabHost = () => {
  return new Promise((resolve, reject) => {
    browser.tabs.query({
      active: true,
      currentWindow: true,
    }).then((tab) => {
      resolve(Lab.extractHostname(tab[0].url));
    }).catch((err) => {
      reject(err);
    });
  });
};


const insertCspConfig = () => {
  Lab.read('config').then((config) => {
    const strictness = config.strictness;

    // for each strictness level, we need to add a select for it
    Object.entries(strictness).forEach((kv) => {
      const directive = kv[0];
      const setting = kv[1];
      console.log('elem is', `csp-config-${directive}`);

      // set the proper value on the select
      document.getElementById(`csp-config-${directive}`).value = setting;
    });
  });
};


const writeConfig = () => {
  const strictness = {};

  return new Promise((resolve, reject) => {
    // read in all the CSP config settings
    for (const row of document.getElementsByClassName('csp-form-control')) {
      strictness[row.getAttribute('data-directive')] = row.value;
    }

    // now let's write everything back
    Lab.read('config').then((config) => {
      config.strictness = strictness;

      Lab.write('config', config).then(() => {
        console.log('Successfully wrote config', config, 'back to settings');
        resolve(config);
      }).catch(err => reject(err));
    });
  });
};


const insertCSP = () => {
  // get the host for the current tab and the strictness in the config section
  Promise.all([getCurrentTabHost(), Lab.read('config')]).then((values) => {
    buildCSP(values[0], values[1].strictness).then((csp) => {  // insert it into the page
      document.getElementById('csp-record').textContent = csp;
    });
  });
};


const determineToggleState = (host) => {  // TODO: make this more generic
  // get the list of current hosts and set the toggle to on if it's in there
  return new Promise((resolve, reject) => {
    Lab.read('hosts').then((hosts) => {
      if (hosts.includes(host)) {
        resolve(true);
      } else {
        resolve(false);
      }
    }).catch((err) => {
      reject(err);
    });
  });
};


const toggleRecord = function toggleRecord(host, enable) {
  console.log('enable is', enable, 'host is', host);
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
  // retrieve a site's active status and check the box if its active
  getCurrentTabHost().then(host => determineToggleState(host)).then((state) => {
    $('#toggle-csp-record').prop('checked', state);
  }).then(() => {
    // set a listener for toggling for a site
    $('#toggle-csp-record').change((event) => {
      getCurrentTabHost().then(host => toggleRecord(host, event.target.checked));
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
    lab.initStorage(true);
  });

  // bind a listener for every time we change a config setting, TODO: make this more generic
  document.getElementById('csp-config').addEventListener('change', () => {
    writeConfig().then(() => insertCSP());
  });
});
