1. `node generate.stock.order.js -payload payload.json`

2. `docker run --rm -v "$(pwd)":/Users/pulkitsinghal/dev/warehouse-manager-generate-stock-order -w /Users/pulkitsinghal/dev/warehouse-manager-generate-stock-order iron/images:node-0.10 sh -c 'node generate.stock.order.js -payload payload.json'`

  ```
module.js:340
    throw err;
          ^
Error: Cannot find module '/Users/pulkitsinghal/dev/warehouse-manager-generate-stock-order/generate.stock.order.js'
    at Function.Module._resolveFilename (module.js:338:15)
    at Function.Module._load (module.js:280:25)
    at Function.Module.runMain (module.js:497:10)
    at startup (node.js:119:16)
    at node.js:906:3
  ```
