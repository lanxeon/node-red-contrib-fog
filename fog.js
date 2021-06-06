module.exports = function (RED) {
  function Fog(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // initializing properties
    node.number = +config.number;
    node.capacity = +config.capacity;
    node.IPS = +config.IPS; // Instructions per second
    node.latency = +config.latency;
    node.level = +config.level;

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
      msg.payload = msg.payload.toLowerCase();

      // wait for this before performing actions
      await timeout(node.latency);

      node.send(msg);
    });
  }
  RED.nodes.registerType("fog", Fog);
};

// number_of_instructions, capacity
