var fs = require('fs');
var utils = require('./jobs/utils/utils.js');
//var Promise = require('bluebird');

var params = null;
var task_id = null;
var config = null;

console.log(process.argv);
process.argv.forEach(function(val, index, array) {
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

/*var worker = require('node_helper');
console.log('params:', worker.params);
console.log('config:', worker.config);
console.log('task_id:', worker.task_id);*/

console.log('params:', params);
console.log('config:', config);
console.log('task_id:', task_id);

utils.savePayloadConfigToFiles(params);

//console.log('==== ' + process.env.NODE_ENV + ' ====');
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

/*client.models.Person.create({
    name: 'Fred'
  },
  function(err, newperson) {
    console.log('Created Person...');
    console.log(err || newperson);
  });*/

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

/*client.models.ReportModel.findById(1,
  function(err, reportModelInstance) {
    console.log('Find a ReportModel...');
    console.log(err || reportModelInstance);
    reportModelInstance.updateAttribute('content', rows, function(err, reportModelInstance) {
      console.log('Update a ReportModel...');
      console.log(err || reportModelInstance);
    });
  });*/