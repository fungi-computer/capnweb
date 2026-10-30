import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { queryObjects } from "node:v8";
import * as upstream from "capnweb";
import * as fork from "../dist/index.js";

function connect(t, sender, receiver, target) {
  const channel = new MessageChannel();
  const source = sender.newMessagePortRpcSession(channel.port1, target);
  const remote = receiver.newMessagePortRpcSession(channel.port2);
  t.after(() => {
    remote[Symbol.dispose]();
    source[Symbol.dispose]();
    channel.port1.close();
    channel.port2.close();
  });
  return remote;
}

function body() {
  return new ReadableStream({
    start(controller) {
      // A media-sized transfer exercises ongoing streaming, not just a tiny
      // body that can finish before an incompatible peer's error arrives.
      for (let index = 0; index < 16; index++) {
        controller.enqueue(new Uint8Array(64 * 1024).fill(0x5a));
      }
      controller.close();
    },
  });
}

function assertBody(buffer) {
  const result = Buffer.from(buffer);
  assert.equal(result.length, 1024 * 1024);
  assert.equal(Buffer.compare(result, Buffer.alloc(1024 * 1024, 0x5a)), 0);
}

for (const [name, sender, receiver] of [
  ["updated → upstream 0.12.0", fork, upstream],
  ["upstream 0.12.0 → updated", upstream, fork],
  ["updated → updated", fork, fork],
]) {
  test(`streams bodies ${name}`, { timeout: 5000 }, async (t) => {
    class Producer extends sender.RpcTarget {
      open() {
        return body();
      }
      response() {
        return new Response(body());
      }
      async blob() {
        return new Blob([await new Response(body()).arrayBuffer()]);
      }
      async request(request) {
        return new Blob([await request.arrayBuffer()]);
      }
      ping() {
        return "alive";
      }
    }
    const remote = connect(t, sender, receiver, new Producer());
    assertBody(await new Response(await remote.open()).arrayBuffer());
    assertBody(await (await remote.response()).arrayBuffer());
    assertBody(await (await remote.blob()).arrayBuffer());
    const request = new Request("https://example.invalid/upload", {
      method: "POST",
      body: body(),
      duplex: "half",
    });
    assertBody(await (await remote.request(request)).arrayBuffer());
    assert.equal(await remote.ping(), "alive");
  });
}

for (const [name, chunks] of [
  ["idle", 1],
  ["queued", 64],
]) {
  test(
    `cancels the ${name} source without closing RPC`,
    { timeout: 5000 },
    async (t) => {
      let cancelled;
      const cancellation = new Promise((resolve) => {
        cancelled = resolve;
      });
      class Producer extends fork.RpcTarget {
        open() {
          return new ReadableStream({
            start(controller) {
              for (let index = 0; index < chunks; index++) {
                controller.enqueue(new Uint8Array(64 * 1024));
              }
            },
            cancel: cancelled,
          });
        }
        ping() {
          return "alive";
        }
      }
      const remote = connect(t, fork, fork, new Producer());
      const reader = (await remote.open()).getReader();
      assert.equal((await reader.read()).done, false);
      await reader.cancel();
      await cancellation;
      assert.equal(await remote.ping(), "alive");
    },
  );
}

test(
  "releases completed stream resources while RPC stays open",
  { timeout: 5000 },
  async (t) => {
    class Producer extends fork.RpcTarget {
      open() {
        return body();
      }
      ping() {
        return "alive";
      }
    }
    const remote = connect(t, fork, fork, new Producer());
    async function consume() {
      assertBody(await new Response(await remote.open()).arrayBuffer());
      assert.equal(await remote.ping(), "alive");
      await setImmediate();
    }
    await consume();
    // The maintained V8 counter performs GC itself. Observe retained native
    // streams through the public API, not the RPC session's private tables.
    const before = queryObjects(WritableStream, { format: "count" });
    for (let index = 0; index < 8; index++) await consume();
    const after = queryObjects(WritableStream, { format: "count" });
    assert.equal(
      after,
      before,
      "completed transfers must release their writers",
    );
    assert.equal(await remote.ping(), "alive");
  },
);

test(
  "notifies every observer when one releases the broken capability",
  { timeout: 5000 },
  async (t) => {
    class Capability extends fork.RpcTarget {}
    class Producer extends fork.RpcTarget {
      capability() {
        return new Capability();
      }
    }
    const remote = connect(t, fork, fork, new Producer());
    const capability = await remote.capability();
    const observed = [];
    capability.onRpcBroken(() => {
      observed.push("first");
      capability[Symbol.dispose]();
    });
    capability.onRpcBroken(() => {
      observed.push("second");
    });
    remote[Symbol.dispose]();
    await setImmediate();
    assert.deepEqual(observed, ["first", "second"]);
  },
);
