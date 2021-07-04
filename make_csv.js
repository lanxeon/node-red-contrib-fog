const fs = require("fs");

const { responses } = require("./response-logs/Optimal.json");

const fileName = __dirname + "/lmao.csv";

fs.writeFileSync(fileName, "Timeout\n");

responses.map(({ payload: { timeout } }) => {
  fs.appendFileSync(fileName, `${timeout}\n`);
});
