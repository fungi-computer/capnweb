# @fungi.computer/capnweb

Cap'n Web is a JavaScript-native, object-capability RPC system: no schemas, no
code generation, human-readable (JSON-based) wire format, and support for
bidirectional calling, passing functions/objects by reference, and promise
pipelining (chaining dependent calls into a single network round trip). It
works over HTTP, WebSocket, and `postMessage()`, in browsers, Cloudflare
Workers, Node.js, Bun, and Deno.

## Fungi fork

This package is a Fungi fork of
[cloudflare/capnweb](https://github.com/cloudflare/capnweb) at the `0.12.0`
release (commit `7702075`). The source is unchanged except for one fix in
`src/types.d.ts`: `UnstubifyInner` spreads a tuple tail through
`UnstubifyAll<Tail>` instead of `Unstubify<Tail>`. `Unstubify<Tail>` is a union
that includes `Promise`, so the upstream declarations fail with TS2574 ("A
rest element type must be an array type") under `skipLibCheck: false` and lose
tuple parameter types. Drop this fork when upstream capnweb publishes the fix.

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
  }
};
```

Three dependent calls, one round trip:

```ts
using api = newHttpBatchRpcSession<Api>("https://example.com/api");

// No awaits, so no round trips yet.
using authed = api.authenticate(apiToken);
let friendIds = authed.getFriendIds();

// One await. One round trip. Everything above travelled together.
let friends = await friendIds.map(id => api.getUserProfile(id));
```

For the full API, transports, and server-runtime guides, see the
[upstream documentation site](https://github.com/cloudflare/capnweb/tree/main/packages/docs)
and the [upstream README](https://github.com/cloudflare/capnweb#readme).

## Where it's used

[Oyster](https://github.com/fungi-computer/oyster) uses this fork for its RPC
transport.

## License

MIT. This package carries the upstream Cloudflare copyright and license
unchanged — see [LICENSE.txt](./LICENSE.txt) and [NOTICE](./NOTICE).
