var SUCCESS = 0;
var FAILURE = 1;

var REPORT_EMPTY = 'report_empty';
var MANAGER_NEW_ORDERS = 'manager_new_orders';
var MANAGER_IN_PROCESS = 'manager_in_process';
var WAREHOUSE_FULFILL = 'warehouse_fulfill';
var MANAGER_RECEIVE = 'manager_receive';
var REPORT_COMPLETE = 'report_complete';

var PAGE_SIZE = 200;

try {
  var fs = require('fs');
  var utils = require('./jobs/utils/utils.js');
  var path = require('path');
  var Promise = require('bluebird');
  var _ = require('underscore');

  // Global variable for logging
  var commandName = path.basename(__filename, '.js'); // gives the filename without the .js extension

  var params = null;
  var task_id = null;
  var config = null;

  console.log(commandName, process.argv);
  process.argv.forEach(function (val, index, array) {
    if (val == '-payload') {
      params = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
    }

    if (val === '-config') {
      config = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
    }

    if (val === '-id') {
      task_id = process.argv[index + 1];
    }
  });

  console.log(commandName, 'params:', params);
  console.log(commandName, 'config:', config);
  console.log(commandName, 'task_id:', task_id);

  try {
    return utils.savePayloadConfigToFiles(params)
      .then(function () {
        try {
          var nconf = require('nconf');
          nconf.file('client', { file: 'config/client.json' })
            //.file('settings', { file: 'config/settings.json' }) // NOTE: useful for quicker testing
            .file('oauth', { file: 'config/oauth.json' });

          console.log(commandName, 'nconf:', nconf.get());

          // HACK starts: dynamically set remote datasource URL
          var datasourcesFile = path.join(__dirname, 'client', 'datasources.json');
          console.log(commandName, 'datasourcesFile: ' + datasourcesFile);
          fs.writeFileSync(datasourcesFile,
            JSON.stringify({
              "db": {
                "name": "db",
                "connector": "memory"
              },
              "remoteDS": {
                "url": params.loopbackServerUrl + '/api',
                "name": "remoteDS",
                "connector": "remote"
              }
            }, null, 2));
          var datasourcesContent = require(datasourcesFile);
          console.log(commandName, 'datasourcesContent: ' + JSON.stringify(datasourcesContent, null, 2));
          // HACK ends

          var client = require('./client/loopback.js');
          // the remote datasource
          var remoteDS = client.dataSources.remoteDS;

          // the strong-remoting RemoteObjects instance
          var remotes = remoteDS.connector.remotes;

          var ReportModel = client.models.ReportModel;
          var StockOrderLineitemModel = client.models.StockOrderLineitemModel;

          return Promise.resolve(params)
            .then(function setupAuthentication (params) {
              console.log(commandName, 'WTF');
              if (params.reportId === undefined || params.reportId === null) {
                console.log(commandName, 'reportId is missing');
                console.error('reportId is missing');
                process.exit(FAILURE);
              }
              else {
                console.log(commandName, 'report already exists');

                // set the access token to be used for all future invocations
                console.log(commandName, 'params.loopbackAccessToken.id', params.loopbackAccessToken.id);
                console.log(commandName, 'params.loopbackAccessToken.userId', params.loopbackAccessToken.userId);
                remotes.auth = {
                  bearer: (new Buffer(params.loopbackAccessToken.id)).toString('base64'),
                  sendImmediately: true
                };
                console.log(commandName, 'the access token to be used for all future invocations has been set');

                return Promise.resolve(params.reportId);
              }
            })
            .then(ReportModel.findByIdAsync)
            .then(function(reportModelInstance) {
              var stockOrderLineitemModels = Promise.promisifyAll(
                reportModelInstance.stockOrderLineitemModels,
                {
                  filter: function(name, func, target){
                    return !( name == 'validate');
                  }
                }
              );
              return stockOrderLineitemModels.countAsync()
                .then(function (count) {
                  var totalPages = Math.ceil(count / PAGE_SIZE);
                  console.log('Will traverse %d rows by fetching %d page(s) of size <= %d', count, totalPages, PAGE_SIZE);

                  var pseudoArrayToIterateOverPagesSerially = new Array(totalPages);
                  for (var i=0; i<totalPages; i++) {
                    pseudoArrayToIterateOverPagesSerially[i] = i+1;
                  }

                  // this block has been moved up (and a bit out of context) for optimization so it doesn't run inside loops
                  var vendSdk = require('vend-nodejs-sdk')({});
                  var utils = require('./jobs/utils/utils.js');
                  var connectionInfo = utils.loadOauthTokens();
                  console.log('SUCCESSFULLY LOADED AUTH TOKENS FOR VEND CALLS');

                  // constraint Promise.map with concurrency of 1 around pseudoArrayIterateAllPages
                  return Promise.map(
                    pseudoArrayToIterateOverPagesSerially,
                    function (pageNumber) {
                      return ReportModel.getRowsAsync(params.reportId, PAGE_SIZE, pageNumber)
                        .then(function (stockOrderLineitemModelInstances) {
                          console.log('total lineitems retrieved for page #%d: %d',
                            pageNumber, stockOrderLineitemModelInstances.length);

                          console.log('will create consignment products serially in Vend for page #%d', pageNumber);
                          return Promise.map(stockOrderLineitemModelInstances, function (stockOrderLineitemModelInstance) {
                              // TODO: should we also avoid working on products without type (department)?
                              if (stockOrderLineitemModelInstance.productId &&
                                _.isNumber(stockOrderLineitemModelInstance.supplyPrice) &&
                                stockOrderLineitemModelInstance.supplyPrice !== null &&
                                stockOrderLineitemModelInstance.supplyPrice !== undefined)
                              {
                                var consignmentProduct = {
                                  //'sequence_number': 1,
                                  'consignment_id': reportModelInstance.vendConsignmentId,
                                  'product_id': stockOrderLineitemModelInstance.productId,
                                  'count': stockOrderLineitemModelInstance.orderQuantity,
                                  'cost': stockOrderLineitemModelInstance.supplyPrice
                                };
                                //console.log('will create a consignmentProduct: ', consignmentProduct);
                                return vendSdk.consignments.products.create({body:consignmentProduct}, connectionInfo)
                                  .then(function (newVendConsignmentProduct) {
                                    //console.log('newVendConsignmentProduct', newVendConsignmentProduct);
                                    return Promise.resolve(newVendConsignmentProduct);
                                  });
                              }
                              else {
                                console.log('skipping lineitems without a Vend productId and/or cost');
                              }
                            },
                            {concurrency: 1}
                          );

                        });
                    },
                    {concurrency: 1}
                  )
                    .then(function () {
                      console.log('done paging serially through all existing stockOrderLineitemModels');

                      console.log('since equivalent consignment products were created, let\'s move the consignment itself from OPEN to SENT');
                      var argsForStockOrder = vendSdk.args.consignments.stockOrders.markAsSent();
                      argsForStockOrder.apiId.value = reportModelInstance.vendConsignmentId;
                      argsForStockOrder.body.value = _.omit(reportModelInstance.vendConsignment, 'id');
                      return vendSdk.consignments.stockOrders.markAsSent(argsForStockOrder, connectionInfo)
                        .then(function (updatedStockOrder) {
                          console.log('markStockOrderAsSent()', 'updatedStockOrder', updatedStockOrder);
                          return Promise.resolve(updatedStockOrder);
                        });
                    })
                    .then(function (updatedStockOrder) {
                      console.log('since stock order is not in SENT state, let\'s move the STATE of our report to the next stage');
                      reportModelInstance.state = MANAGER_RECEIVE;
                      reportModelInstance.vendConsignment = updatedStockOrder;
                      return ReportModel.updateAllAsync( // TODO: could just use reportModelInstance.save
                        {id: params.reportId},
                        reportModelInstance
                      )
                        .tap(function (updatedReportModelInstance) {
                          console.log(commandName, 'Updated the ReportModel...', updatedReportModelInstance);
                        });
                    });
                });
            })
            .catch(function (error) {
              console.error('2nd last dot-catch block');
              console.log(commandName, 'ERROR', error);
              return Promise.reject(error);
            });
        }
        catch (e) {
          console.error('3rd last catch block');
          console.error(commandName, e);
          // TODO: throw or float up promise chain or just exit the worker process here?
        }
      })
      .catch(function (error) {
        console.error('last dot-catch block');
        console.log(commandName, 'ERROR', error);
        process.exit(FAILURE); // this is the last one so exit the worker process
      });
  }
  catch (e) {
    console.error('2nd last catch block');
    console.error(commandName, e);
    // TODO: throw or float up promise chain or just exit the worker process here?
  }

}
catch (e) {
  console.error('last catch block');
  console.error(e);
  process.exit(FAILURE);
}