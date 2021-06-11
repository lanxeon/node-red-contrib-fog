const fs = require("fs");

module.exports = function (RED) {
  function ResponseLogger(config) {
    RED.nodes.createNode(this, config);

    this.filename = __dirname + "/response-logs/" + Date.now() + ".json";

    const node = this;

    fs.writeFileSync(node.filename, "[]");

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      let curData = JSON.parse(fs.readFileSync(node.filename));
      curData.push(msg);

      fs.writeFileSync(node.filename, JSON.stringify(curData));
    });
  }

  RED.nodes.registerType("response-logger", ResponseLogger);
};
