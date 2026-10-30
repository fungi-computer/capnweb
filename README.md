# @fungi.computer/capnweb

Cap'n Web is a JavaScript-native, object-capability RPC system: no schemas, no
code generation, human-readable (JSON-based) wire format, and support for
bidirectional calling, passing functions/objects by reference, and promise
pipelining (chaining dependent calls into a single network round trip). It works
over HTTP, WebSocket, and `postMessage()`, in browsers, Cloudflare Workers,
Node.js, Bun, and Deno.

## Fungi fork

This package is a Fungi fork of
[cloudflare/capnweb](https://github.com/cloudflare/capnweb) at the `0.12.0`
release (commit `7702075`). It carries two fixes:

- In `src/types.ts`, `UnstubifyInner` spreads a tuple tail through
  `UnstubifyAll<Tail>` instead of `Unstubify<Tail>`. `Unstubify<Tail>` is a
  union that includes `Promise`, so the upstream declarations fail with TS2574
  ("A rest element type must be an array type") under `skipLibCheck: false` and
  lose tuple parameter types.
- In `src/streams.ts` and `src/rpc.ts`, exported stubs report breakage through
  the existing `onBroken` callback and broken-reference `reject` message. Native
  writable-stream hooks now report writer failure through that machinery.
  Writable proxies observe that callback, so cancelling a received readable
  interrupts an idle sender's pipe without waiting for another chunk. This does
  not expose writer properties or add wire messages, peer negotiation or a
  fallback. Upstream 0.12.0 and Fungi's 0.6.0-era peers keep streaming normally
  with their previous cancellation latency; immediate idle cancellation requires
  the fix at both ends. Import entries release their callback registrations when
  disposed, including normally completed pipes; session abort notifies a
  snapshot of live observers so one observer's cleanup cannot suppress the
  others.

Drop this fork when upstream Cap'n Web includes both fixes. Agent and inbox
transport cancellation is exercised through actual MessagePort RPC and native
HTTP in `packages/agar/src/agents-rpc.test.ts`. `pnpm test` exercises mixed-peer
streaming against maintained upstream `capnweb@0.12.0`, a test-only dependency,
and resource release in a live session plus complete observer delivery on abort.
Its resource law uses Node's maintained V8 object counter rather than private
RPC tables.

## Install

```sh
npm install @fungi.computer/capnweb
```

## Example

A client:

```js
import { newWebSocketRpcSession } from "@fungi.computer/capnweb";

// One-line setup.
let api = newWebSocketRpcSession("wss://example.com/api");

// Call a method on the server!
let result = await api.hello("World");

console.log(result);
```

A server:

```js
import { RpcTarget, newWorkersRpcResponse } from "@fungi.computer/capnweb";

// This is the server implementation.
class MyApiServer extends RpcTarget {
  hello(name) {
    return `Hello, ${name}!`;
  }
}

// Standard Cloudflare Workers HTTP handler.
//
// (Node, Deno, Bun and other runtimes are supported too.)
export default {
  fetch(request, env, ctx) {
    let url = new URL(request.url);

    if (url.pathname === "/api") {
      return newWorkersRpcResponse(request, new MyApiServer());
    }

    return new Response("Not found", { status: 404 });
  },
};
```

Three dependent calls, one round trip:

```ts
using api = newHttpBatchRpcSession<Api>("https://example.com/api");

// No awaits, so no round trips yet.
using authed = api.authenticate(apiToken);
let friendIds = authed.getFriendIds();

// One await. One round trip. Everything above travelled together.
let friends = await friendIds.map((id) => api.getUserProfile(id));
```

For the full API, transports, and server-runtime guides, see the
[upstream documentation site](https://github.com/cloudflare/capnweb/tree/main/packages/docs)
and the [upstream README](https://github.com/cloudflare/capnweb#readme).

## Where it's used

[Oyster](https://github.com/fungi-computer/oyster), the Hub and App SDK use this
fork for browser/frame RPC and Agent/inbox Request and Response bodies. The
Computer client and Cordyceps's bundled computerd also use it for WebSocket and
HTTP-batch RPC, including file/Blob and execution-event streams. App Releases,
hosts, CLI bundles and Computer images can be built independently; normal
streaming must remain valid with their upstream 0.12.0-era peers.

## License

MIT. This package carries the upstream Cloudflare copyright and license
unchanged — see [LICENSE.txt](./LICENSE.txt) and [NOTICE](./NOTICE).
