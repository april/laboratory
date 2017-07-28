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


const writeStrictnessToState = () => {
  const strictness = window.Lab.state.config.strictness;

  // read in all the CSP config settings
  for (const row of document.getElementsByClassName('csp-form-control')) {
    strictness[row.getAttribute('data-directive')] = row.value;
  }
};


const insertCsp = host => {
  // get the host for the current tab and then insert its CSP
  const builtCSP = Lab.buildCsp(host);

  document.getElementById('csp-record').textContent = builtCSP.text;

  // TODO: make sure things are clear if you're using unsafe-inline
  if ('script-src' in builtCSP.records) {
    if (builtCSP.records['script-src'].includes('\'unsafe-inline\'') ||
        builtCSP.records['script-src'].includes('data:')) {
      // make the column look scary
      $('#csp-col').addClass('alert-danger');
      $('#csp-row-unsafe-inline-warning').removeClass('hidden');
    } else {
      $('#csp-col').removeClass('alert-danger');
      $('#csp-row-unsafe-inline-warning').addClass('hidden');
    }
  }

  return builtCSP.records;
};


const insertRecordingCount = () => {
  // insert the proper count of how many sites are being recorded
  document.getElementById('csp-recording-count').textContent = window.Lab.state.config.recordingHosts.length.toString();
};


const toggleRecord = function toggleRecord(configRecord, host, enable) {
  const record = window.Lab.state.config[configRecord];
  const records = window.Lab.state.records;  // list of recorded URLs

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

  // now we reinitialize the listeners
  window.Lab.init();
};


const toggleToggler = (host, dependenciesOnly) => {
  const states = {
    enforced: window.Lab.state.config.enforcedHosts.includes(host),
    recording: window.Lab.state.config.recordingHosts.includes(host),
  };

  if (!dependenciesOnly) {
    Object.entries(states).forEach(([toggleId, toggled]) => {
      $(`#csp-toggle-${toggleId}`).prop('checked', toggled);
    });
  }

  // enable or disable recording, if enforcement is checked
  $('#csp-toggle-recording').prop('disabled', states.enforced);

  // if the host is undefined (such as on a blank tab, disable all toggles)
  if (host === '') {
    $('.csp-toggle').prop('disabled', true);
  }
};


const toggleEvent = event => {
  getCurrentTabHost().then(host => {
    // get the toggle name
    const toggleId = event.target.id.split('-').pop();

    // toggle the correct record, based on its id
    toggleRecord(`${toggleId}Hosts`, host, event.target.checked);

    // update the number of sites we're recording
    insertRecordingCount();

    // set the toggle dependencies
    toggleToggler(host, true);

    // flush the changes to disk and then insert the current CSP
    window.Lab.writeLocalState().then(() => insertCsp(host));
  });
};


/* bind to our backend window object */
browser.runtime.getBackgroundPage().then(winder => {
  window.Lab = winder.Lab;
});


const handleDOMContentLoaded = (resetting = false) => {
  getCurrentTabHost().then(host => {
    // set the correct number of recorded hosts
    insertRecordingCount();

    if (!resetting) {  // we only want to do this when not recursing
      // set events on all the togglers
      $('.csp-toggle').on('change', toggleEvent);

      // bind a listener for the trash icon to delete all records
      $('#btn-trash').on('click', () => {
        window.Lab.clearState();

        window.Lab.writeLocalState().then(() => handleDOMContentLoaded(true));
      });

      // bind a listener for every time we change a config setting
      // TODO: make this more generic
      $('#csp-config').on('change', () => {
        writeStrictnessToState();
        Promise.all([window.Lab.writeLocalState(), getCurrentTabHost()]).then(args => {
          insertCsp(args[1]);
        });
      });
    }

    // retrieve a site's active status and check the box if its active
    toggleToggler(host);

    // display the current CSP if we have one
    const records = insertCsp(host);

    // insert the config pulldowns
    insertCspConfig();

    // unhide configuration directions for CSP records that are actually there
    let numRecords = 0;
    Object.entries(records).forEach(([k, v]) => {
      if (v.length > 0) {
        $(`#csp-config-row-${k}`).removeClass('hidden');
        numRecords += v.length;
      }
    });

    // if we actually have no records yet, hide the entire configuration section
    if (numRecords === 0) {
      $('#csp-config').addClass('hidden');
    }

    // initialize all our clipboards
    const clipboard = new Clipboard('.btn');
  });
};


// initialize the document
document.addEventListener('DOMContentLoaded', () => {
  handleDOMContentLoaded();
});
