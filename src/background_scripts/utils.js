export const extractHostname = (url) => {
  return new URL(url).host;
}

export const getCurrentTabHostname = async () => {
  console.log('inside getCurrentTabHostname()');
  const tab = await browser.tabs.query({
      active: true,
      currentWindow: true,
  });
  console.log('inside getCurrentTabHostname() with', tab);

  return extractHostname(tab[0].url);
};
