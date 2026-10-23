import { RpcStub, RpcTarget } from "@fungi.computer/capnweb";

class Calculator extends RpcTarget {
  add(...[left, right]: [number, number]): number {
    return left + right;
  }
  tuple(value: [string, number]): [string, number] {
    return value;
  }
}

const stub = new RpcStub(new Calculator());
try {
  const sum: number = await stub.add(Promise.resolve(20), 22);
  const tuple: [string, number] = await stub.tuple(["answer", 42]);
  void sum;
  void tuple;
} finally {
  stub[Symbol.dispose]();
}
