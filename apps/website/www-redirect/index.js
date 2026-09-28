// Permanent redirect to the canonical host, keeping the path and query so a shared
// www link (for example www.lyniago.com/about) lands on the same page.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.protocol = "https:";
    url.hostname = "lyniago.com";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  },
};
