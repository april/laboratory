import * as browser from 'webextension-polyfill';

export const extractHostname = (url) => {
  return new URL(url).host;
}

export const getCurrentTabHostname = async () => {
  const tab = await browser.tabs.query({
      active: true,
      currentWindow: true,
  });

  return extractHostname(tab[0].url);
};
