const fs = require("fs");

module.exports = function (RED) {
  function Fog(config) {
    RED.nodes.createNode(this, config);

    fs.writeFileSync("lmao.txt", "hello");

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // initializing properties
    this.number = +config.number;
    this.capacity = +config.capacity;
    this.IPS = +config.IPS; // Instructions per second
    this.latency = +config.latency;
    this.level = +config.level;

    const node = this;

    let nodeContext = node.context(); //node context
    let flowContext = node.context().flow; //flow context (kind of like global context)

    nodeContext.set("capacity", node.capacity);
    nodeContext.set("jobs", []);

    let fogNodes = flowContext.get("fogNodes");
    let highestLevel = flowContext.get("highestLevel");

    // for setting highest level among fog nodes
    if (!highestLevel || this.level > highestLevel)
      flowContext.set("highestLevel", this.level);

    // for setting up the global state of fog nodes by levels and then node number
    if (!fogNodes) {
      flowContext.set("fogNodes", {
        [this.level]: { [node.number]: { ...node } },
      });
    } else {
      flowContext.set("fogNodes", {
        ...fogNodes,
        [this.level]: fogNodes[this.level]
          ? { ...fogNodes[this.level], [node.number]: { ...node } }
          : { [node.number]: { ...node } },
      });
    }

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      // wait for this before performing actions
      await timeout(node.latency);

      // perform actions
      let { payload } = msg;
      payload.timeout += node.latency;
      payload.path.push(node.number);

      // console.log(payload);

      if (payload.capacity > nodeContext.get("capacity")) {
        if (this.level === flowContext.get("highestLevel")) {
          // go to cloud
          return node.send({
            payload,
            forwardTo: "cloud",
            forwardedBy: node.number,
          });
        }

        let fogNodes = node.context().flow.get("fogNodes");
        let nextLevel = fogNodes[node.level + 1];
        let highestCap = 0;
        let highestCapNode;

        for (const levelNode of Object.keys(nextLevel)) {
          console.log(
            nextLevel[levelNode].number,
            nextLevel[levelNode].capacity
          );

          if (nextLevel[levelNode].capacity > highestCap) {
            highestCap = nextLevel[levelNode].capacity;
            highestCapNode = levelNode;
          }
        }

        node.send({
          payload,
          forwardTo: highestCapNode,
          forwardedBy: node.number,
        });
      } else {
        // calculate new capacity(RAM)
        let subtractedCapacity = payload.capacity;
        let curCapacity = nodeContext.get("capacity");
        let newCapacity = curCapacity - subtractedCapacity;
        nodeContext.set("capacity", newCapacity);

        // update global state
        let curFogNodes = { ...node.context().flow.get("fogNodes") };
        curFogNodes[node.level][node.number]["capacity"] = newCapacity;
        node.context().flow.set("fogNodes", curFogNodes);

        console.log(
          node.number,
          node.context().flow.get("fogNodes")[node.level][node.number].capacity
        );

        // calculate elapsed time and wait for it, then set capacity back
        let elapsedTime = (payload.instructions / node.IPS) * 1000; // convert seconds to ms
        await timeout(elapsedTime);

        nodeContext.set("capacity", curCapacity);
        curFogNodes[node.level][node.number]["capacity"] = curCapacity;
        node.context().flow.set("fogNodes", curFogNodes);

        console.log(
          node.number,
          node.context().flow.get("fogNodes")[node.level][node.number].capacity
        );

        payload.timeout += elapsedTime;

        node.send({ payload, forwardTo: 0, completedBy: node.number });
      }
    });
  }

  RED.nodes.registerType("fog-node", Fog);
};
