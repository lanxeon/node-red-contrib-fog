const fs = require("fs");

module.exports = function (RED) {
  function Fog(config) {
    RED.nodes.createNode(this, config);

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const modes = ["highest_capacity", "earliest_response", "equal_capacity"];

    // initializing properties
    this.number = +config.number;
    this.capacity = +config.capacity;
    this.IPS = +config.IPS; // Instructions per second
    this.latency = +config.latency;
    this.level = +config.level;

    // load balancing mode
    this.mode = config.mode;

    if (!modes.includes(this.mode)) {
      this.mode = "highest_capacity";
    }

    const node = this;

    let nodeContext = node.context(); //node context
    let flowContext = node.context().flow; //flow context (kind of like global context)

    // set node context
    nodeContext.set("capacity", node.capacity);
    nodeContext.set("load", 0);
    nodeContext.set("loadPercentage", 0);
    nodeContext.set("jobs", []);

    // get global(flow) context
    let fogNodes = flowContext.get("fogNodes");
    let highestLevel = flowContext.get("highestLevel");

    // for setting highest level among fog nodes
    if (!highestLevel || this.level > highestLevel)
      flowContext.set("highestLevel", this.level);

    // for setting up the global state of fog nodes by levels and then node number
    if (!fogNodes) {
      flowContext.set("fogNodes", {
        [this.level]: {
          [node.number]: { ...node, load: 0, loadPercentage: 0 },
        },
      });
    } else {
      flowContext.set("fogNodes", {
        ...fogNodes,
        [this.level]: fogNodes[this.level]
          ? {
              ...fogNodes[this.level],
              [node.number]: {
                ...node,
                load: 0,
                loadPercentage: 0,
                totalCapacity: node.capacity,
              },
            }
          : {
              [node.number]: {
                ...node,
                load: 0,
                loadPercentage: 0,
                totalCapacity: node.capacity,
              },
            },
      });
    }

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      // wait for this before performing actions
      await timeout(node.latency);

      // fs.writeFileSync(`${Date.now()}.txt`, JSON.stringify(msg));

      // perform actions
      let { payload } = msg;
      payload.timeout += node.latency;
      payload.path.push(node.number);

      if (payload.capacity > nodeContext.get("capacity")) {
        if (this.level === flowContext.get("highestLevel")) {
          // go to cloud
          return node.send({
            ...msg,
            payload,
            forwardTo: "cloud",
            forwardedBy: node.number,
          });
        }

        let fogNodes = node.context().flow.get("fogNodes");
        let nextLevel = fogNodes[node.level + 1];
        let chosenNode;
        let highestCapNode;

        let highestCap = 0;
        let lowestPercentage = 100;
        let lowestPredictedTime = 9999999;

        switch (node.mode) {
          case "highest_capacity":
            for (const levelNode of Object.keys(nextLevel)) {
              if (nextLevel[levelNode].capacity > highestCap) {
                highestCap = nextLevel[levelNode].capacity;
                chosenNode = highestCapNode = levelNode;
              }
            }

            break;

          case "earliest_response":
            for (const levelNode of Object.keys(nextLevel)) {
              if (nextLevel[levelNode].capacity > highestCap) {
                highestCap = nextLevel[levelNode].capacity;
                highestCapNode = levelNode;

                if (nextLevel[levelNode].capacity > payload.capacity) {
                  let predictedTime =
                    nextLevel[levelNode].timeout +
                    (payload.instructions / nextLevel[levelNode].IPS) * 1000;

                  if (predictedTime < lowestPredictedTime) {
                    lowestPredictedTime = predictedTime;
                    chosenNode = levelNode;
                  }
                }
              }
            }
            if (!chosenNode) {
              chosenNode = highestCapNode;
            }

            break;

          case "equal_capacity":
            for (const levelNode of Object.keys(nextLevel)) {
              if (nextLevel[levelNode].capacity > highestCap) {
                highestCap = nextLevel[levelNode].capacity;
                highestCapNode = levelNode;

                if (
                  nextLevel[levelNode].capacity > payload.capacity &&
                  nextLevel[levelNode].loadPercentage < lowestPercentage
                ) {
                  lowestPercentage = nextLevel[levelNode].loadPercentage;
                  chosenNode = levelNode;
                }
              }
            }
            if (!chosenNode) {
              chosenNode = highestCapNode;
            }
            break;
        }

        node.send({
          payload,
          forwardTo: chosenNode,
          forwardedBy: node.number,
        });
      } else {
        // calculate new capacity(RAM)
        let subtractedCapacity = payload.capacity;
        let curCapacity = nodeContext.get("capacity");
        let curLoad = nodeContext.get("load");
        // let curLoadPercentage = nodeContext.get("loadPercentage");

        let newCapacity = curCapacity - subtractedCapacity;
        let newLoad = curLoad + subtractedCapacity;
        let newLoadPercentage =
          ((curLoad + subtractedCapacity) / node.capacity) * 100;

        // update node state
        nodeContext.set("capacity", newCapacity);
        nodeContext.set("load", newLoad);
        nodeContext.set("loadPercentage", newLoadPercentage);

        // update global state
        let curFogNodes = { ...node.context().flow.get("fogNodes") };
        curFogNodes[node.level][node.number]["capacity"] = newCapacity;
        curFogNodes[node.level][node.number]["load"] = newLoad;
        curFogNodes[node.level][node.number]["loadPercentage"] =
          newLoadPercentage;
        node.context().flow.set("fogNodes", curFogNodes);

        // calculate elapsed time and wait for it, then set capacity back
        let elapsedTime = (payload.instructions / node.IPS) * 1000; // convert seconds to ms
        await timeout(elapsedTime);

        // calculate new capacity(RAM)
        subtractedCapacity = payload.capacity;
        curCapacity = nodeContext.get("capacity");
        curLoad = nodeContext.get("load");
        // curLoadPercentage = nodeContext.get("loadPercentage");

        newCapacity = curCapacity + subtractedCapacity;
        newLoad = curLoad - subtractedCapacity;
        if (newLoad < 0) console.log({ curLoad, subtractedCapacity });
        newLoadPercentage =
          ((curLoad - subtractedCapacity) / node.capacity) * 100;

        // update node state
        nodeContext.set("capacity", newCapacity);
        nodeContext.set("load", newLoad);
        nodeContext.set("loadPercentage", newLoadPercentage);

        // update global state
        curFogNodes = { ...node.context().flow.get("fogNodes") };
        curFogNodes[node.level][node.number]["capacity"] = newCapacity;
        curFogNodes[node.level][node.number]["load"] = newLoad;
        curFogNodes[node.level][node.number]["loadPercentage"] =
          newLoadPercentage;
        node.context().flow.set("fogNodes", curFogNodes);

        payload.timeout += elapsedTime;

        node.send({
          ...msg,
          payload,
          forwardTo: "debug",
          completedBy: node.number,
        });
      }
    });
  }

  RED.nodes.registerType("fog-node", Fog);
};
