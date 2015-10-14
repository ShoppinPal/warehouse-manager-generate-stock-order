var SUCCESS = 0;
var FAILURE = 1;

var REPORT_EMPTY = 'report_empty';
var MANAGER_NEW_ORDERS = 'manager_new_orders';
var MANAGER_IN_PROCESS = 'manager_in_process';
var WAREHOUSE_FULFILL = 'warehouse_fulfill';
var MANAGER_RECEIVE = 'manager_receive';
var REPORT_COMPLETE = 'report_complete';

var BOXED = 'boxed';

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
                  if (params.op) {
                    console.log('Will run the OP for: ' + params.op);
                    return Promise.resolve(params.op);
                  }
                  else {
                    return Promise.reject(commandName + ' > params.op is not specified');
                  }
                });
            })
            .tap(function removeUnreceivedProducts (methodName) {
              if(methodName !== 'removeUnreceivedProducts') {
                console.log('will skip removeUnreceivedProducts');
                return Promise.resolve();
              }
              else {
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
                    var where = { // only work with rows that need to be deleted
                      //reportId: params.reportId, // don't need this, lineitem object is a relational instance already
                      or: [
                        {receivedQuantity: null},
                        {receivedQuantity: {exists: false}},
                        {receivedQuantity: {lte: 0}}
                      ],
                      vendConsignmentProductId: {ne: null}
                    };
                    return stockOrderLineitemModels.countAsync(where)
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
                            return client.models.ReportModel.getRowsAsync(params.reportId, pageSize, pageNumber, where)
                              .then(function (lineitems) {
                                console.log('total lineitems retrieved for page #%d: %d', pageNumber, lineitems.length);

                                return Promise.map(
                                  lineitems,
                                  function (lineitem) {
                                    console.log('DELETE lineitem from Vend w/ productId:', lineitem.productId, '\n',
                                      'name:', lineitem.name, '\n',
                                      'state:', lineitem.state, '\n',
                                      'ordered:', lineitem.orderQuantity,
                                      ', fulfilled:', lineitem.fulfilledQuantity,
                                      ', received:', lineitem.receivedQuantity);
                                    var deleteStockOrderRow = require('./jobs/delete-stock-order-row.js');
                                    return deleteStockOrderRow.run(lineitem.vendConsignmentProductId)
                                      .catch(function(error) {
                                        console.error('removeUnreceivedProducts dot-catch block');
                                        console.log(commandName, 'ERROR', error);
                                        return Promise.resolve(); // ignore the error to keep going
                                      });
                                  },
                                  {concurrency: 1}
                                )
                                  .then(function () {
                                    console.log('done deleting ALL lineitems for page #%d', pageNumber);
                                    return Promise.resolve();
                                  });
                              });
                          },
                          {concurrency: 1}
                        )
                          .then(function afterPagingSerially() {
                            console.log(commandName, ' > all pages done');
                            console.log(commandName, ' > done with removeUnreceivedProducts op');

                            console.log(commandName, ' > will update the status of stock order in Vend to RECEIVED');
                            var markStockOrderAsReceived = require('./jobs/mark-stock-order-received.js');
                            return markStockOrderAsReceived.run(
                              reportModelInstance.vendConsignmentId,
                              _.omit(reportModelInstance.vendConsignment, 'id')
                            )
                              .then(function updateReportModel (updatedStockOrder) {
                                console.log(commandName, ' > updated stock order in Vend to RECEIVED', updatedStockOrder);
                                reportModelInstance.vendConsignment = updatedStockOrder;
                                return client.models.ReportModel.updateAllAsync(
                                  {id: params.reportId},
                                  reportModelInstance
                                )
                                  .tap(function (info) {
                                    console.log(commandName, 'Updated the ReportModel...');
                                    console.log(commandName, info);
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