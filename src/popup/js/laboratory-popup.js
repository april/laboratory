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


const insertCsp = () => {
  // get the host for the current tab and then insert its CSP
  getCurrentTabHost().then(host => {
    const builtCSP = Lab.buildCsp(host);

    document.getElementById('csp-record').textContent = builtCSP.text;

    // TODO: make sure things are clear if you're using unsafe-inline
    if ('script-src' in builtCSP.records) {
      if (builtCSP.records['script-src'].includes('\'unsafe-inline\'') ||
          builtCSP.records['script-src'].includes('data:')) {
        // make the column look scary
        document.getElementById('csp-col').classList.add('alert-danger');
        document.getElementById('csp-row-unsafe-inline-warning').classList.remove('hidden');
      } else {
        document.getElementById('csp-col').classList.remove('alert-danger');
        document.getElementById('csp-row-unsafe-inline-warning').classList.add('hidden');
      }
    }
  });
};


const insertRecordingCount = () => {
  // insert the proper count of how many sites are being recorded
  document.getElementById('csp-recording-count').textContent = window.Lab.state.config.hosts.length.toString();
};


const determineToggleState = host => {  // TODO: make this more generic
  // get the list of current hosts and set the toggle to on if it's in there
  return new Promise((resolve, reject) => {
    return resolve({
      'toggle-csp-record': window.Lab.state.config.hosts.includes(host),
      'toggle-csp-enforcement': window.Lab.state.config.enforcedHosts.includes(host),
    });
  });
};


const toggleRecord = function toggleRecord(configRecord, host, enable) {
  const record = window.Lab.state.config[configRecord];
  const records = window.Lab.state.records;

  // lets bail if you try to toggle the host on a weird thing (like moz-extension://)
  if (!host) { return; }

  // if it's in the hosts list + enable -> move on
  // if it's not in the hosts list + disable -> move on
  // this shouldn't happen, but we're guarding against it anyways
  // also wtf does es6 not have a true logical xor operator?
  if ((record.includes(host)) ^ !enable) {
    console.error('Unexpected toggling for site encountered');
    return;
  }

  if (enable) {
    record.push(host);
  } else {
    // remove it from the list of monitored sites
    const i = record.indexOf(host);
    record.splice(i, 1);


    // remove any previous records for a site, if we have any
    if ((host in records) && (configRecord === 'hosts')) {
      delete records[host];
    }
  }

  console.log('state is', window.Lab.state);

  // now we reinitialize the listeners
  window.Lab.init();
};


/* bind to our backend window object */
browser.runtime.getBackgroundPage().then(winder => {
  window.Lab = winder.Lab;
});


/* set up our event listeners */
document.addEventListener('DOMContentLoaded', () => {
  // set the correct number of recorded hosts
  insertRecordingCount();

  // retrieve a site's active status and check the box if its active
  getCurrentTabHost().then(host => determineToggleState(host)).then(toggles => {
    Object.entries(toggles).forEach(([toggleId, toggled]) => {
      $(`#${toggleId}`).prop('checked', toggled);
    });
  }).then(() => {
    // set a listener for toggling recording for a site
    $('#toggle-csp-record').change(event => {
      getCurrentTabHost().then(host => {
        toggleRecord('hosts', host, event.target.checked);
        insertRecordingCount();
        window.Lab.writeLocalState().then(() => insertCsp());
      });
    });

    // there's no listener for enforcement, it simply changes how it's implemented
    $('#toggle-csp-enforcement').change(event => {
      getCurrentTabHost().then(host => {
        toggleRecord('enforcedHosts', host, event.target.checked);
        window.Lab.writeLocalState().then();
      });
    });
  });

  // display the current CSP if we have one
  insertCsp();

  // insert the config pulldowns
  insertCspConfig();

  // initialize all our clipboards
  const clipboard = new Clipboard('.btn');

  // bind a listener for the trash icon to delete all records
  document.getElementById('btn-trash').addEventListener('click', () => {
    window.Lab.clearState();

    window.Lab.writeLocalState().then(() => {
      $('.csp-toggle').prop('checked', false);  // unset all CSP checkboxes
      window.Lab.init();
      insertRecordingCount();
      insertCsp();
      insertCspConfig();
    });
  });


  // bind a listener for every time we change a config setting, TODO: make this more generic
  document.getElementById('csp-config').addEventListener('change', () => {
    writeConfig().then(() => {
      window.Lab.writeLocalState().then(() => insertCsp());
    });
  });
});
