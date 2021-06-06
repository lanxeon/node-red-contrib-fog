module.exports = function (RED) {
  function Fog(config) {
    RED.nodes.createNode(this, config);

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

    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    let fogNodes = flowContext.get("fogNodes");
    if (fogNodes) {
      flowContext.set("fogNodes", {
        [node.number]: { ...node },
      });
    } else {
      flowContext.set("fogNodes", { ...fogNodes, [node.number]: { ...node } });
    }

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      // wait for this before performing actions
      await timeout(node.latency);

      node.send(msg);
    });
  }

  RED.nodes.registerType("fog-node", Fog);
};

// number_of_instructions, capacity
