module.exports = function (RED) {
  function Cloud(config) {
    RED.nodes.createNode(this, config);

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // initializing properties
    this.capacity = 50000;
    this.IPS = 15000;
    this.latency = 650; //500 ms latency

    const node = this;

    let nodeContext = node.context(); //node context
    let flowContext = node.context().flow; //flow context (kind of like global context)

    nodeContext.set("capacity", node.capacity);

    let fogNodes = flowContext.get("fogNodes");
    let highestLevel = flowContext.get("highestLevel");

    // for setting highest level among fog nodes
    if (!highestLevel || this.level > highestLevel)
      flowContext.set("highestLevel", this.level);

    // for setting up the global state of fog nodes by levels and then node number
    if (!fogNodes) {
      flowContext.set("fogNodes", {
        cloud: { cloud: { ...node } },
      });
    } else {
      flowContext.set("fogNodes", {
        ...fogNodes,
        cloud: { cloud: { ...node } },
      });
    }

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      // wait for this before performing actions
      await timeout(node.latency);

      // perform actions
      let { payload } = msg;
      payload.timeout += node.latency;
      payload.path.push("cloud");

      if (payload.capacity > nodeContext.get("capacity")) {
        // go to cloud
        return node.send({
          ...msg,
          payload,
          completedBy: "discarded",
        });
      } else {
        // calculate new capacity(RAM)
        let subtractedCapacity = payload.capacity;
        let curCapacity = nodeContext.get("capacity");
        let newCapacity = curCapacity - subtractedCapacity;
        nodeContext.set("capacity", newCapacity);

        // update global state
        let curFogNodes = { ...node.context().flow.get("fogNodes") };
        curFogNodes.cloud.cloud.capacity = newCapacity;
        node.context().flow.set("fogNodes", curFogNodes);

        // calculate elapsed time and wait for it, then set capacity back
        let elapsedTime = (payload.instructions / node.IPS) * 1000; // convert seconds to ms
        await timeout(elapsedTime);

        nodeContext.set("capacity", curCapacity);
        curFogNodes.cloud.cloud.capacity = curCapacity;
        node.context().flow.set("fogNodes", curFogNodes);

        payload.timeout += elapsedTime;

        node.send({
          ...msg,
          payload,
          forwardTo: "debug",
          completedBy: "cloud",
        });
      }
    });
  }

  RED.nodes.registerType("cloud", Cloud);
};
