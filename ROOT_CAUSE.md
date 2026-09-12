# Root Cause — v1.2.1 Nested Apps Script iframe relay

The v1.2.0 diagnostic incorrectly classified the timeout as an authentication block. Evidence from production showed the Satellite HTML itself rendered correctly, while the Main page never received `READY`.

Apps Script HTML Service executes in an IFRAME sandbox. When one Apps Script web app is embedded inside another, the Satellite client is one level deeper than the iframe element owned by Main. v1.2.0 sent messages only to `window.parent`, which is Google's HTMLService wrapper, while Main listened in its own inner HTMLService frame. Main also required `event.source === iframe.contentWindow`, but `iframe.contentWindow` is the outer Satellite wrapper, not the inner Satellite client.

A second issue was the correlation channel being carried in the URL fragment. Fragments apply to the outer navigation and are not a reliable way to pass state into the inner HTMLService sandbox.

v1.2.1 fixes this by:

- passing `channel` as a normal query parameter to `doGet`;
- injecting the validated channel into the Satellite template;
- relaying Satellite messages to all ancestor browsing contexts (bounded to 8 levels);
- accepting HANDOFF only from an ancestor with the matching random channel;
- pinning Main to the first valid Satellite inner window and its Apps Script origin;
- distinguishing direct access with the server-provided `embed` flag;
- replacing the misleading AUTH_BLOCKED timeout with a nested-frame-specific diagnostic;
- tightening Main URL validation to an exact `/exec` path boundary.

The signed ticket remains out of the URL and is sent only after a valid `READY`. HMAC, nonce replay protection, PC_Access, session TTL, runner assertion, and the public-transport hardening remain unchanged.
