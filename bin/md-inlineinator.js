/** This is a Webpack Loader to manage referenced images in Markdown documents.
 * This makes the markdown portable across environments, transforming them
 * into either inline images or co-located images (depending on webpack config).
 * Note that this does *not* use a Markdown parser! I searched, but there aren't
 * that many good options for working with a syntax tree and just manipulating
 * link nodes. So we use a regex instead.
 *
 * Shamelessly stolen from https://bocoup.com/blog/webpack-a-simple-loader
 */

const loaderUtils = require("loader-utils");

// This regex only matches images, since those are simpler and YAGNI. Alt-text
// is described in the brackets, and the parens contain only the URL. This is
// not true of regular links, which can be of the form `[text](link alt)`.
var imageRE = /(\!\[[^\]]*\]\([^\)]+\))/g;
module.exports = function(content) {
  return (
    'module.exports = [\n' +
    content.split(imageRE).map(i => requestImage(this, i)).join(',\n') +
    '\n].join();'
  );
};

var partRE = /(\!\[[^\]]*\]\()([^\)]+)(\))/g;
function requestImage(webpackContext, markdownItem) {
  var parts = partRE.exec(markdownItem);
  if (parts) {
    const url = loaderUtils.urlToRequest(parts[2]);
    const request = loaderUtils.stringifyRequest(webpackContext, url);
    // tell the webpack watcher about that dep
    webpackContext.addDependency(url);
    return [
      JSON.stringify(parts[1]),
      'require(' + request + ')',
      JSON.stringify(parts[3])
    ].join(' + ');
  }
  return JSON.stringify(markdownItem);
}