import $ from 'jquery';
import 'bootstrap';
import ClipboardJS from 'clipboard';

import { getCurrentTabHostname } from '../background_scripts/utils';

/* bind to our backend window object */
browser.runtime.getBackgroundPage().then(winder => {
  window.Lab = winder.Lab;
});


const getCustomCsp = host => {
  return {
    exists: window.Lab.state.config.customcspHosts.includes(host),
    text: window.Lab.state.config.customcspRecords[host],
  };
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
  let builtCSP;

  // if we have a custom CSP, return that first
  if (getCustomCsp(host).exists) {
    builtCSP = {
      records: {},
      text: getCustomCsp(host).text || 'default-src \'none\'',
    };
  } else {
    // get the host for the current tab and then insert its CSP
    builtCSP = Lab.buildCsp(host);
  }

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
    record.splice(record.indexOf(host), 1);

    // remove any previous records for a site, if we have any
    if ((host in records) && (configRecord === 'hosts')) {
      delete records[host];
    }
  }

  // now we reinitialize the listeners
  window.Lab.init();
};


// TODO: rename
const toggleToggler = (host) => {
  const states = {
    customcsp: getCustomCsp(host).exists,
    enforced: window.Lab.state.config.enforcedHosts.includes(host),
    recording: window.Lab.state.config.recordingHosts.includes(host),
  };

  // set all the toggler states
  Object.entries(states).forEach(([toggleId, toggled]) => {
    $(`#csp-toggle-${toggleId}`).prop('checked', toggled);
  });

  // hide/show the Edit and/or Copy items, depending on whether or not we have a custom CSP
  $('.csp-edit-item').toggleClass('hidden', !states.customcsp);
  $('.csp-copy-item').toggleClass('hidden', states.customcsp);
  $('#csp-record').parent().toggleClass('success', states.customcsp);

  // start with a clean slate
  $('.csp-toggle').prop('disabled', false);
  $('.csp-toggle-label').removeClass('disabled');

  // if we've got a custom CSP, we check the enforced button and disable everything else
  if (states.customcsp) {
    $('#csp-toggle-recording').prop('checked', false).prop('disabled', true);
    $('#csp-toggle-enforced').prop('checked', true).prop('disabled', true);
    $('#csp-toggle-recording-label, #csp-toggle-enforced-label').addClass('disabled');
  } else if (states.enforced) {
    // enable or disable recording, if enforcement is checked
    $('#csp-toggle-recording').prop('disabled', states.enforced);
    $('#csp-toggle-recording-label').addClass('disabled');
  }

  // if the host is undefined (such as on a blank tab, disable all toggles)
  if (host === '') {
    $('.csp-toggle').prop('disabled', true);
  }
};


const toggleEvent = async (e) => {
  const host = await getCurrentTabHostname();

  // get the toggle name
  const toggleId = e.target.id.split('-').pop();

  // toggle the correct record, based on its id
  toggleRecord(`${toggleId}Hosts`, host, e.target.checked);

  // update the number of sites we're recording
  insertRecordingCount();

  // if we're triggering the custom CSP, pop up the modal if needed
  if (toggleId === 'customcsp' && e.target.checked) {
    $('#csp-customcsp-modal').modal();
  }

  // set the toggle dependencies
  toggleToggler(host);

  // flush the changes to disk and then insert the current CSP
  window.Lab.writeLocalState().then(() => insertCsp(host));
};


const handleDOMContentLoaded = async (reload = false) => {
  const host = await getCurrentTabHostname();

  // set the correct number of recorded hosts
  insertRecordingCount();

  if (!reload) {  // we only want to do this when not recursing
    /* BEGIN MODAL CODE */

    // the custom CSP edit button
    $('#csp-btn-edit').on('click', () => { $('#csp-customcsp-modal').modal(); });

    // automatically focus on input in modal and set the input value
    $('#csp-customcsp-modal').on('shown.bs.modal', () => {
      const v = window.Lab.state.config.customcspRecords[host] || 'default-src \'none\'';
      $('#csp-customcsp-record').val(v).select();
    });

    // save the value of the custom CSP when we close the modal and refresh
    // the dom content
    const save = () => {
      const v = $('#csp-customcsp-record').val().trim();

      // if it's blank, remove it from the list of custom CSP hosts
      if (v === '') {
        window.Lab.state.config.customcspHosts.splice(
          window.Lab.state.config.customcspHosts.indexOf(host), 1);
        delete window.Lab.state.config.customcspRecords[host];
      } else {
        window.Lab.state.config.customcspRecords[host] = v;
      }

      handleDOMContentLoaded(true);
    };

    $('#csp-customcsp-save').on('click', save);
    $('#csp-customcsp-modal').on('keyup', e => {
      if (e.keyCode === 13) {
        save();
        $('#csp-customcsp-modal').modal('hide');
      }
    });

    $('#csp-customcsp-clear').on('click', () => {
      $('#csp-customcsp-record').val('').select();
    });

    /* END MODAL CODE */

    // set events on all the togglers
    $('.csp-toggle').on('click', toggleEvent);

    // bind a listener for the trash icon to delete all records
    $('#btn-trash').on('click', () => {
      window.Lab.clearState();

      window.Lab.writeLocalState().then(() => handleDOMContentLoaded(true));
    });

    // bind a listener for every time we change a config setting
    // TODO: make this more generic
    $('#csp-config').on('change', () => {
      writeStrictnessToState();
      Promise.all([window.Lab.writeLocalState(), getCurrentTabHostname()]).then(args => {
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
  new ClipboardJS('.btn');
};


// initialize the document
document.addEventListener('DOMContentLoaded', async () => {
  handleDOMContentLoaded();
});
