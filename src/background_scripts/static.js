/* returns an copy of the default state */
export const defaultState = () => {
  return Object.assign({}, {
    config: {
      customcspHosts: [],   // list of hosts where CSP is manually overridden
      customcspRecords: {}, // mapping of hosts to custom CSP records
      enforcedHosts: [],    // list of hosts we are enforcing the generate CSP policy on
      recordingHosts: [],   // list of hosts to record
      strictness: {
        'connect-src': 'self-if-same-origin-else-path',
        'form-action': 'origin',
        'font-src': 'origin',
        'frame-src': 'origin',
        'img-src': 'origin',
        'manifest-src': 'self-if-same-origin-else-directory',
        'media-src': 'origin',
        'object-src': 'path',
        'prefetch-src': 'self-if-same-origin-else-path',
        'script-src': 'self-if-same-origin-else-path',
        'style-src': 'self-if-same-origin-else-directory',
        'worker-src': 'self-if-same-origin-else-path',
      },
    },
    records: {},  // hosts -> sources mapping    
  });
};

/* the list of sites that Laboratory can't monitor */
export const unmonitorableSites = [
  'addons.mozilla.org',
  'discovery.addons.mozilla.org',
  'testpilot.firefox.com',
];