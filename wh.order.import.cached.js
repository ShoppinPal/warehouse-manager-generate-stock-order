var SUCCESS = 0;
var FAILURE = 1;

var REPORT_EMPTY = 'report_empty';
var MANAGER_NEW_ORDERS = 'manager_new_orders';
var MANAGER_IN_PROCESS = 'manager_in_process';
var WAREHOUSE_FULFILL = 'warehouse_fulfill';
var MANAGER_RECEIVE = 'manager_receive';
var REPORT_COMPLETE = 'report_complete';

var BOXED = 'boxed';

/* When a generic error without a helpful stacktrace occurs, it makes troubleshooting difficult.
 *
 * Without knowing the depth or location at which the error took place,
 * we are forced to litter the code with log statements.
 *
 * This is why, despite decent error propagation, our code has way more catch statements then needed!
 * We are prepared for a situation where we can easily identify the closest code block
 * where the problem in the occured.
 *
 * With that in mind, there are 3 usecases:
 * 1. We want to log the error but still continue by eating or forgiving the error ... due to some "business logic"
 * 2. We want to log the error and propagate it as well ... this makes little to no sense!
 *    Why have the same error logged by multiple catch blocks? How is that helpful?
 *    Its better to log it and then fail-fast, rather than creating redundant rows of logs
 *    that might confuse the person who is troubleshooting a problem
 * 3. We want to log the error and fail-fast.
 */
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

  global.taskId = task_id; // TODO: need to name it better to avoid collisions?

  try {
    var ironCache = require('iron-cache');
    var cache = Promise.promisifyAll(ironCache.createClient({
      project: config.ironProjectId,
      token: config.ironWorkersOauthToken
    }));

    process.env['User-Agent'] = task_id + ':' + commandName + ':' + params.domainPrefix;
    return utils.savePayloadConfigToFiles(params)
      .then(function () {
        try {
          var nconf = require('nconf');
          nconf.file('client', { file: 'config/client.json' })
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

          /*console.log('before', remoteDS);
           console.log('before', remoteDS.url);
           remoteDS.url = params.loopbackServerUrl;
           console.log('after', remoteDS.url);*/

          // the strong-remoting RemoteObjects instance
          var remotes = remoteDS.connector.remotes;

          // TODO: (2) figure out the total # of pages we will be dealing with
          //           ex: 42 pages total
          // TODO: (3) run the report for totalPages/5 pages
          //           ex: page 1-5
          // TODO: (4) queue the next job to work on the res of the pages
          //           ex: start at page 6/42, work on pages 6-10
          // TODO: (5) last job to run should change the state from empty to new_orders
          //           ex: whomever process pages 40-42

          return Promise.resolve(params)
            .then(function (params) { // (1) create a report if params.reportId is empty
              console.log(commandName, 'WTF');
              if (params.reportId === undefined || params.reportId === null) {
                console.log(commandName, 'need to create a new report');

                return client.models.UserModel.loginAsync(params.credentials) // get an access token
                  .then(function(token) {
                    console.log('Logged in as', params.credentials.email);

                    params.loopbackAccessToken = token;

                    // set the access token to be used for all future invocations
                    console.log(commandName, 'params.loopbackAccessToken.id', params.loopbackAccessToken.id);
                    console.log(commandName, 'params.loopbackAccessToken.userId', params.loopbackAccessToken.userId);
                    remotes.auth = {
                      bearer: (new Buffer(params.loopbackAccessToken.id)).toString('base64'),
                      sendImmediately: true
                    };
                    console.log(commandName, 'the access token to be used for all future invocations has been set');

                    return Promise.resolve();
                  })
                  .then(function(){
                    return client.models.ReportModel.createAsync({
                      userModelToReportModelId: params.loopbackAccessToken.userId, // explicitly setup the foreignKeys for related models
                      state: REPORT_EMPTY,
                      outlet: {
                        id: params.outletId,
                        name: params.outletName // TODO: fetch via an api call instead?
                      },
                      supplier: {
                        id: params.supplierId,
                        name: params.supplierName // TODO: fetch via an api call instead?
                      }
                    });
                  })
                  .then(function (reportModelInstance) {
                    console.log('new reportModelInstance:', reportModelInstance);
                    params.reportId = reportModelInstance.id; // save the new report id into the params
                    return Promise.resolve();
                  });
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

                return Promise.resolve();
              }
            })
            .then(function decideOp () {
              // NOTE: no time to investigate why we end up accidently nuking our foreign-keys
              //       later on somwhere in code ... when we use this shortcut to avoid one extra server call
              //var reportModelInstance = new client.models.ReportModel({id: params.reportId});

              return client.models.ReportModel.findByIdAsync(params.reportId)
                .then(function(reportModelInstance){
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
                      console.log('inside decideOp(), count:', count);
                      if (count > 0) { // if rows already exist, it means the raw data was imported already
                        console.log('Will run the OP for: importStockOrderCached');
                        return Promise.resolve('importStockOrderCached');
                      }
                      else {
                        return Promise.reject(commandName + ' > raw data has not been imported yet');
                      }
                    });
                });
            })
            .tap(function importStockOrderCached (methodName) {
              if(methodName !== 'importStockOrderCached') {
                console.log('will skip importStockOrderCached');
                return Promise.resolve();
              }
              else {
                var prepStockOrder = require('./jobs/cache-vend-products-for-stock-order.js');
                /*var products = require('/Users/pulkitsinghal/Dropbox/vend-tools/fetch-vend-products-for-stock-order-patricias-dilutedProducts.json');
                return Promise.resolve(products)*/ // NOTE: useful for quicker testing
                return prepStockOrder.run(
                  params.reportId,
                  params.outletId,
                  params.supplierId,
                  params.loopbackAccessToken.userId,
                  cache
                )
                  .then(function (/*dilutedProducts*/) {
                    // NOTE: no time to investigate why we end up accidently nuking our foreign-keys
                    //       later on somwhere in code ... when we use this shortcut to avoid one extra server call
                    //var reportModelInstance = new client.models.ReportModel({id: params.reportId});
                    return client.models.ReportModel.findByIdAsync(params.reportId)
                      .then(function(reportModelInstance){
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
                            var pageSize = 200;
                            var totalPages = Math.ceil(count / pageSize);
                            console.log('Will traverse %d rows by fetching %d page(s) of size <= %d', count, totalPages, pageSize);

                            var pseudoArrayToIterateOverPagesSerially = new Array(totalPages);
                            for (var i=0; i<totalPages; i++) {
                              pseudoArrayToIterateOverPagesSerially[i] = i+1;
                            }

                            // constraint Promise.map with concurrency of 1 around pseudoArrayIterateAllPages
                            return Promise.map(
                              pseudoArrayToIterateOverPagesSerially,
                              function (pageNumber) {
                                return client.models.ReportModel.getRowsAsync(params.reportId, pageSize, pageNumber)
                                  .then(function (lineitems) {
                                    console.log('total lineitems retrieved for page #%d: %d', pageNumber, lineitems.length);

                                    // cross-reference and fill out lineitems against data from Vend
                                    return Promise.map(
                                      lineitems,
                                      function (lineitem) {
                                        var key = lineitem.sku + ':' + taskId;
                                        console.log('lookup vend data for:', key);
                                        return cache.getAsync('my-cache', key)
                                          .then(function(response){
                                            console.log(response);
                                            var dilutedProduct = JSON.parse(response.value);
                                            if (dilutedProduct) {
                                              lineitem.productId = dilutedProduct.id;
                                              lineitem.name = dilutedProduct.name;
                                              lineitem.quantityOnHand = Number(dilutedProduct.inventory.count);
                                              lineitem.desiredStockLevel = Number(dilutedProduct.inventory['reorder_point']);
                                              lineitem.fulfilledQuantity = lineitem.orderQuantity;
                                              lineitem.type = dilutedProduct.type;
                                              if (lineitem.type) { // warehouse folks can choose to box those lacking department/product-type, manually
                                                lineitem.state = BOXED; // boxed by default
                                                lineitem.boxNumber = 1; // boxed together by default
                                              }
                                            }
                                            else {
                                              console.log('WARN: did not find cached vend data for lineitem', lineitem);
                                              // TODO: should we queue up these lineitem rows for deletion from the report?
                                              //       or is it better to leave them for reporting purposes?
                                            }
                                            return Promise.resolve();
                                          })
                                          .catch(function (error) {
                                            console.error('failed to lookup vend data from cache, maybe it expired or maybe it was never placed there');
                                            console.log(commandName, 'ERROR', error);
                                            console.log('ignoring this ERROR, so that we may finish the rest of the process');
                                            return Promise.resolve();
                                          });
                                      },
                                      {concurrency: 1}
                                    )
                                      .then(function(){
                                        console.log('cross-referenced and filled out lineitems against data from IronCache');
                                        console.log('will send update(s) to loopback');
                                        return client.models.ReportModel.updateRowsAsync(params.reportId, lineitems);
                                      });
                                  });
                              },
                              {concurrency: 1}
                            )
                              .then(function () {
                                console.log('done paging serially through all existing stockOrderLineitemModels');

                                console.log('since the lineitems were updated properly, let\'s move the STATE of our report to the next stage');
                                reportModelInstance.state = WAREHOUSE_FULFILL;
                                reportModelInstance.totalRows = count; // TODO: should we change it to be only what was corss-reference-able?
                                return client.models.ReportModel.updateAllAsync(
                                  {id: params.reportId},
                                  reportModelInstance
                                )
                                  .tap(function (info) {
                                    console.log(commandName, 'Updated the ReportModel...');
                                  });
                              });
                          });
                      });
                  });
              }
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
          process.exit(FAILURE); // error-handling-usecase-3
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
    process.exit(FAILURE); // error-handling-usecase-3
  }

}
catch (e) {
  console.error('last catch block');
  console.error(e);
  process.exit(FAILURE);
}