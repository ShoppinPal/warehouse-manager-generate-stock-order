var SUCCESS = 0;
var FAILURE = 1;

try {
  var fs = require('fs');
  var utils = require('./jobs/utils/utils.js');
  var path = require('path');
  var Promise = require('bluebird');
  var _ = require('underscore');
  var vendSdk = require('vend-nodejs-sdk')({});
  var moment = require('moment');

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
        try 
        {
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
          var filteredSales = [];
          var deleteFromVend = [];
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

                /*console.log(commandName, 'WTF');
                console.log(commandName, 'report already exists');
                params.loopbackAccessToken = params.credentials;
                // set the access token to be used for all future invocations
                console.log(commandName, 'params.loopbackAccessToken.id', params.loopbackAccessToken.id);
                console.log(commandName, 'params.loopbackAccessToken.userId', params.loopbackAccessToken.userId);
                remotes.auth = {
                  bearer: (new Buffer(params.loopbackAccessToken.id)).toString('base64'),
                  sendImmediately: true
                };
                console.log(commandName, 'the access token to be used for all future invocations has been set');

                return Promise.resolve();*/
            })
            .then(function getSales(){
              //check for zero sales


              var aWeekAgo = moment.utc().subtract(4, 'months');
              var twoWeeksAgo = moment.utc().subtract(2, 'weeks');
              var aMonthAgo = moment.utc().subtract(4, 'weeks');
              var sixWeeksAgo = moment.utc().subtract(6, 'weeks');
              var twoMonthsAgo = moment.utc().subtract(8, 'weeks');
              var intervalOptions = [
                aWeekAgo,
                twoWeeksAgo,
                aMonthAgo,
                sixWeeksAgo,
                twoMonthsAgo
              ];
              
              var intervalOptionsForDisplay = [
                  'Starting a week ago (' + aWeekAgo.format('YYYY-MM-DD') + ')',
                  'Starting two weeks ago (' + twoWeeksAgo.format('YYYY-MM-DD') + ')',
                  'Starting a month ago (' + aMonthAgo.format('YYYY-MM-DD') + ')',
                  'Starting six weeks ago (' + sixWeeksAgo.format('YYYY-MM-DD') + ')',
                  'Starting two months ago (' + twoMonthsAgo.format('YYYY-MM-DD') + ')'
              ];

              
              var argsForSales = vendSdk.args.sales.fetch();
              var sinceDate = aWeekAgo.format('YYYY-MM-DD');
              argsForSales.since.value = sinceDate;
              //argsForSales.outletApiId.value = params.outletId;
              var connectionInfo = utils.loadOauthTokens();
              console.log(connectionInfo);

              return vendSdk.sales.fetchAll(argsForSales,connectionInfo)
              .then(function(registerSales){
                  //console.log(commandName + ' > Showing sales :  '+registerSales[0].sale_date);   
                  return Promise.resolve(registerSales);    
                });

              })

            .tap(function filterSales(registerSales) {
          
              var connectionInfo = utils.loadOauthTokens();
              console.log(connectionInfo);
              console.log("Register Sale : "+ registerSales.length);
              return Promise.map(registerSales,function(){
                registerSales.forEach(function(singleSale){
                      var singleProductSale = singleSale.register_sale_products;
                      singleProductSale.forEach(function(sale){
                          filteredSales.push(sale);
                          console.log(sale);
                      })
                    })
              },
              {concurrency: 1});
              
          
            })
            .then(function findProducts()
            {
              var connectionInfo = utils.loadOauthTokens();
              return vendSdk.products.fetchAll(connectionInfo)
              .then(function(products){
                
                console.log("Filtered sale : " + filteredSales.length);
                var dilutedSales = [];
                filteredSales.forEach(function(singleSale){
                  //console.log("Filtered product name : "+ singleSale.name);
                  if((!(filterExists(singleSale.product_id,dilutedSales))))
                  {
                    //console.log("Diluted product name : " + singleSale.name);
                    dilutedSales.push(singleSale);
                  }
                })
                console.log("Diluted sale : " + dilutedSales.length);
                //console.log(dilutedSales);
                
                products.forEach(function(product){
                  if(!(filterExists(product.id,dilutedSales)))
                  {
                    if(!(deletionExists(product,deleteFromVend)))
                    {
                      console.log("Zero Sales : " + product.name);
                      deleteFromVend.push(product);
                    }
                  }

                  if(product.name == "Discount"){

                  }
                  else
                  {
                    var singleProductInventory = product.inventory;
                    singleProductInventory.forEach(function(inv){
                      if(inv.count == 0.00000)
                      {
                        if(!(deletionExists(product,deleteFromVend)))
                        {
                          console.log("Zero inventory : " + product.name);
                          deleteFromVend.push(product);
                        }
                      }
                    });
                  }
                })

                function filterExists(productId,array) {
                    var i = null;
                    for (i = 0; array.length > i; i += 1) {
                        if (array[i].product_id === productId) {
                            return true;
                        }
                    }
                     
                    return false;
                };    
                function deletionExists(obj, objs)
                {
                    var objStr = JSON.stringify(obj);

                    for(var i=0;i<objs.length; i++)
                    {
                        if(JSON.stringify(objs[i]) == objStr)
                        {
                            return 1;
                        }
                    }

                    return 0;
                }            
                console.log("Deletion count : " + deleteFromVend.length);

            })
          })
          
          .catch(function (error) {
              console.error('2nd last dot-catch block');
              console.log(commandName, 'ERROR', error);
              return Promise.reject(error);
            });
        }
        catch (e) 
        {
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
    console.error('Last catch block');
    console.error(commandName, e);
    // TODO: throw or float up promise chain or just exit the worker process here?
}
