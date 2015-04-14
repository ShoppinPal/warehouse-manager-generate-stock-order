try {
  var fs = require('fs');
  var utils = require('./jobs/utils/utils.js');
  var path = require('path');
  //var Promise = require('bluebird');

  var params = null;
  var task_id = null;
  var config = null;

  console.log(process.argv);
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

  console.log('params:', params);
  console.log('config:', config);
  console.log('task_id:', task_id);

  try {
    return utils.savePayloadConfigToFiles(params)
      .then(function () {
        var nconf = require('nconf');
        nconf.file('client', { file: 'config/client.json' })
          .file('oauth', { file: 'config/oauth.json' });

        console.log(nconf.get());

        // HACK starts: dynamically set remote datasource URL
        var datasourcesFile = path.join(__dirname, 'client', 'datasources.json');
        console.log('datasourcesFile: ' + datasourcesFile);
        fs.writeFileSync(datasourcesFile,
          JSON.stringify({
            "db": {
              "name": "db",
              "connector": "memory"
            },
            "remoteDS": {
              "url": params.loopbackServerUrl+'/api',
              "name": "remoteDS",
              "connector": "remote"
            }
          }, null, 2));
        var datasourcesContent = require(datasourcesFile);
        console.log('datasourcesContent: ' + JSON.stringify(datasourcesContent, null, 2));
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

        // set the access token to be used for all future invocations
        remotes.auth = {
          bearer: (new Buffer(params.loopbackAccessToken.id)).toString('base64'),
          sendImmediately: true
        };

        var generateStockOrder = require('./jobs/generate-stock-order.js');
        generateStockOrder.run(params.reportId, params.outletId, params.supplierId, params.loopbackAccessToken.userId)
          .then(function (rows) {
            console.log(rows);

            return client.models.StockOrderLineitemModel.createAsync(rows)
              .then(function (stockOrderLineitemModelInstances) {
                console.log('Create all lineitems...');
                console.log(stockOrderLineitemModelInstances);

                // if the lineitems saved properly then move the STATE to the next stage
                return client.models.ReportModel.findByIdAsync(params.reportId)
                  .then(function (reportModelInstance) {
                    console.log('Found the ReportModel...');
                    console.log(reportModelInstance);

                    reportModelInstance.state = 'manager';

                    return client.models.ReportModel.updateAllAsync(
                      {id: params.reportId},
                      reportModelInstance
                    )
                      .then(function (info) {
                        console.log('Updated the ReportModel...');
                        console.log(info);
                      });
                  });
              })
              .catch(function(error){
                console.log('ERROR', error);
                // TODO: throw or float up promise chain or just exit the worker process here?
              });

          });
      });
  }
  catch (e) {
    console.error(e);
  }

}
catch (e) {
  console.error(e);
}