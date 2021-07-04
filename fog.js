const fs = require("fs");

module.exports = function (RED) {
  function Fog(config) {
    RED.nodes.createNode(this, config);

    // timeout function
    function timeout(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // load balancing modes
    const modes = [
      "highest_capacity",
      "earliest_response",
      "equal_capacity",
      "optimal",
    ];

    // initializing properties
    this.number = +config.number;
    this.capacity = +config.capacity;
    this.IPS = +config.IPS; // Instructions per second
    this.latency = +config.latency;
    this.level = +config.level;
    this.loadThreshold = +config.loadThreshold || 80;
    this.timeoutThreshold = +config.timeoutThreshold || 100;

    // load balancing mode
    this.mode = config.mode;

    if (!modes.includes(this.mode)) {
      this.mode = "optimal"; //let optimal be the default mode
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

    // flowContext.set("load")

    // when flow reaches here with a msg
    node.on("input", async function (msg) {
      // wait for this before performing actions
      await timeout(node.latency);

      // perform actions
      let { payload } = msg;
      let fogNodes = { ...node.context().flow.get("fogNodes") };

      payload.timeout += node.latency;
      payload.path.push(node.number);

      let redirectRequest = false;
      if (payload.capacity > nodeContext.get("capacity")) {
        redirectRequest = true;
      } else if (
        (this.mode === "earliest_response" && payload.instructions / this.IPS) *
          1000 >
        node.timeoutThreshold
      ) {
        redirectRequest = true;
      } else if (
        this.mode === "equal_capacity" &&
        node.context().get("loadPercentage") > node.loadThreshold
      ) {
        redirectRequest = true;
      } else if (this.mode === "optimal") {
        if (this.level === flowContext.get("highestLevel")) {
          let curLoad = node.context().get("loadPercentage");
          if (curLoad > node.loadThreshold) redirectRequest = true;
        } else {
          let curLoads = Object.values(fogNodes[this.level + 1]).map(
            (f) => f.loadPercentage
          );
          let total = curLoads.reduce((a, b) => a + b, 0);

          let averageLoad = total / curLoads.length;
          let curLoad = node.context().get("loadPercentage");
          let predictedResponseTime = (payload.instructions / this.IPS) * 1000;

          if (
            predictedResponseTime > node.timeoutThreshold ||
            (curLoad > node.loadThreshold && curLoad > averageLoad)
          )
            redirectRequest = true;
        }
      }

      if (redirectRequest) {
        // console.log(node.number);

        if (this.level === flowContext.get("highestLevel")) {
          // go to cloud
          return node.send({
            ...msg,
            payload,
            forwardTo: "cloud",
            forwardedBy: node.number,
          });
        }

        let nextLevel = fogNodes[node.level + 1];
        let chosenNode;
        let highestCapNode;

        let highestCap = 0;
        let lowestPercentage = 100;
        let lowestPredictedTime = 9999999;
        let lowestWeightedAverage = 99999999;

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
                    nextLevel[levelNode].latency +
                    (payload.instructions / nextLevel[levelNode].IPS) * 1000;

                  console.log(predictedTime);

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

          default:
            for (const levelNode of Object.keys(nextLevel)) {
              if (nextLevel[levelNode].capacity > highestCap) {
                highestCap = nextLevel[levelNode].capacity;
                highestCapNode = levelNode;

                if (nextLevel[levelNode].capacity > payload.capacity) {
                  let predictedTime =
                    nextLevel[levelNode].latency +
                    (payload.instructions / nextLevel[levelNode].IPS) * 1000;

                  // if (
                  //   nextLevel[levelNode].loadPercentage <= lowestPercentage &&
                  //   predictedTime <= lowestPredictedTime
                  // ) {
                  //   lowestPredictedTime = predictedTime;
                  //   lowestPercentage = nextLevel[levelNode].loadPercentage;
                  //   chosenNode = levelNode;
                  // }

                  if (
                    predictedTime * nextLevel[levelNode].loadPercentage <
                    lowestWeightedAverage
                  ) {
                    lowestPredictedTime = predictedTime;
                    lowestPercentage = nextLevel[levelNode].loadPercentage;
                    chosenNode = levelNode;
                  }
                }
              }
            }
            if (!chosenNode) {
              chosenNode = highestCapNode;
            }
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
