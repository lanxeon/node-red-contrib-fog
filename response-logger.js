const fs = require("fs");

module.exports = function (RED) {
  function ResponseLogger(config) {
    RED.nodes.createNode(this, config);

    this.filename = __dirname + "/response-logs/" + Date.now() + ".json";

    const node = this;

    let responseTimes = [];
    let capacities = [];
    let instructions = [];

    fs.writeFileSync(
      node.filename,
      `{"responses": [], "averages": {"avgResponseTime": 0, "avgCapacity": 0, "avgInstructions": 0}}`
    );

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      let curData = JSON.parse(fs.readFileSync(node.filename));

      let { avgResponseTime, avgCapacity, avgInstructions } = curData.averages;

      let newAvgRT =
        (avgResponseTime * responseTimes.length + msg.payload.timeout) /
          responseTimes.length +
        1;
      let newAvgCap =
        (avgCapacity * capacities.length + msg.payload.capacity) /
          capacities.length +
        1;
      let newAvgIns =
        (avgInstructions * instructions.length + msg.payload.instructions) /
          instructions.length +
        1;

      responseTimes.push(msg.payload.timeout);
      capacities.push(msg.payload.capacity);
      instructions.push(msg.payload.instruction);

      curData.responses.push(msg);
      curData.averages = {
        avgResponseTime: newAvgRT,
        avgCapacity: newAvgCap,
        avgInstructions: newAvgIns,
      };

      fs.writeFileSync(node.filename, JSON.stringify(curData));
    });
  }

  RED.nodes.registerType("response-logger", ResponseLogger);
};
