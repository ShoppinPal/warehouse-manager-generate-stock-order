var iron_worker = require('iron_worker');

var params = iron_worker.params();
var task_id = iron_worker.taskId();
var config = iron_worker.config();

console.log('params:', params);
console.log('config:', config);
console.log('task_id:', task_id);

var utils = require('./jobs/utils/utils.js');
utils.savePayloadConfigToFiles(params)
  .then(function(){
    var nconf = require('nconf');
    nconf.file('client', { file: 'config/client.json' })
      .file('oauth', { file: 'config/oauth.json' });

    console.log(nconf.get());

    var client = require('./client/loopback.js');
    // the remote datasource
    var remoteDS = client.dataSources.remoteDS;
    // the strong-remoting RemoteObjects instance
    var remotes = remoteDS.connector.remotes;

    // set the access token to be used for all future invocations
    remotes.auth = {
      bearer: (new Buffer(params.loopbackAccessToken)).toString('base64'),
      sendImmediately: true
    };

    var generateStockOrder = require('./jobs/generate-stock-order.js');
    generateStockOrder.run(params.outletId, params.supplierId)
      .then(function(rows){
        console.log(rows);

        client.models.ReportModel.findById(1,
          function(err, reportModelInstance) {
            console.log('Find a ReportModel...');
            console.log(err || reportModelInstance);

            reportModelInstance.content = rows;
            client.models.ReportModel.updateAll(
              {id: 1},
              reportModelInstance,
              function(err, info) {
                console.log('Update a ReportModel...');
                console.log(err || info);
              });
          });
      });
  });

/*client.models.ReportModel.findById(1,
  function(err, reportModelInstance) {
    console.log('Find a ReportModel...');
    console.log(err || reportModelInstance);
    reportModelInstance.updateAttribute('content', rows, function(err, reportModelInstance) {
      console.log('Update a ReportModel...');
      console.log(err || reportModelInstance);
    });
  });*/