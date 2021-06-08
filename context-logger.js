const fs = require("fs");

module.exports = function (RED) {
  function Logger(config) {
    RED.nodes.createNode(this, config);

    this.filename = __dirname + "/load-logs/" + Date.now() + ".json";

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const node = this;
    node.context().set("injecting", false);

    fs.writeFileSync(node.filename, "[]");

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      if (msg.action === "start") node.context().set("injecting", true);
      else node.context().set("injecting", false);

      while (node.context().get("injecting")) {
        await timeout(2 * 1000);

        let context = node.context().flow.get("fogNodes");
        let curData = JSON.parse(fs.readFileSync(node.filename));
        curData.push(context);

        fs.writeFileSync(node.filename, JSON.stringify(curData));

        // node.send({
        //   payload: { capacity, instructions, timeout: _timeout, path },
        // });
      }
    });
  }

  RED.nodes.registerType("logger", Logger);
};
