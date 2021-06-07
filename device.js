module.exports = function (RED) {
  function Device(config) {
    RED.nodes.createNode(this, config);

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // initializing properties
    this.minCapacity = +config.minCapacity;
    this.maxCapacity = +config.maxCapacity;
    this.minIPS = +config.minIPS;
    this.maxIPS = +config.maxIPS;
    this.interval = +config.interval; //seconds

    const node = this;

    node.context().set("injecting", false);

    const createRandomValue = (min, max) => {
      return Math.floor(Math.random() * (max - min)) + min;
    };

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      if (msg.action === "start") node.context().set("injecting", true);
      else node.context().set("injecting", false);

      while (node.context().get("injecting")) {
        await timeout(node.interval * 1000);

        let capacity = createRandomValue(node.minCapacity, node.maxCapacity);
        let instructions = createRandomValue(node.minIPS, node.maxIPS);
        let _timeout = 0,
          path = [];

        node.send({
          payload: { capacity, instructions, timeout: _timeout, path },
        });
      }
    });
  }

  RED.nodes.registerType("device", Device);
};
