import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { RpcStub, RpcTarget } from "@fungi.computer/capnweb";

class Calculator extends RpcTarget {
  add(left, right) {
    return left + right;
  }
  refuse() {
    throw new Error("calculator refused");
  }
}

const stub = new RpcStub(new Calculator());
try {
  assert.equal(await stub.add(20, 22), 42);
  await assert.rejects(async () => await stub.refuse(), /calculator refused/);
} finally {
  stub[Symbol.dispose]();
}

const require = createRequire(import.meta.url);
const commonjs = require("@fungi.computer/capnweb");
class CommonjsCalculator extends commonjs.RpcTarget {
  add(left, right) {
    return left + right;
  }
}
const commonjsStub = new commonjs.RpcStub(new CommonjsCalculator());
try {
  assert.equal(await commonjsStub.add(19, 23), 42);
} finally {
  commonjsStub[Symbol.dispose]();
}
