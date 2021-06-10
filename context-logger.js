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
        let data = [];

        Object.keys(context).forEach((k) => {
          let dataToPush = [];
          for (const nodeNumber in context[k]) {
            const nodeData = context[k][nodeNumber];

            dataToPush.push({
              number: +nodeNumber,
              level: +k,
              totalCapacity: nodeData.totalCapacity,
              availableCapacity: nodeData.capacity,
              load: nodeData.load,
              loadPercentage: nodeData.loadPercentage,
              IPS: nodeData.IPS,
            });
          }

          data.push(dataToPush);
        });

        let curData = JSON.parse(fs.readFileSync(node.filename));
        curData.push(data);

        fs.writeFileSync(node.filename, JSON.stringify(curData));

        // node.send({
        //   payload: { capacity, instructions, timeout: _timeout, path },
        // });
      }
    });
  }

  RED.nodes.registerType("logger", Logger);
};

// let val = Object.assign(
//   {},
//   ...(function _flatten(o) {
//     return [].concat(
//       ...Object.keys(o).map((k) =>
//         typeof o[k] === "object" ? _flatten(o[k]) : { [k]: o[k] }
//       )
//     );
//   })(context)
// );
