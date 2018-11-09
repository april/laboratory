/* takes a webRequest.HttpHeaders and removes all the headers in headersToRemove */
export const removeHeaders = (headers, headersToRemove) => {
  // lower case the headers to remove
  const headersToRemoveL = headersToRemove.map(h => h.toLowerCase());

  // remove a list of response headers from a request object
  let i = headers.length;
  while (i > 0) {
    i -= 1;
    if (headersToRemoveL.includes(headers[i].name.toLowerCase())) {
      headers.splice(i, 1);
    }
  }

  return headers;
}