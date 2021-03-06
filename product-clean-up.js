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
  var loopback_filter = require('loopback-filters');

    // Global variable for logging
  var commandName = path.basename(__filename, '.js'); // gives the filename without the .js extension
  var consignmentProductsById = [];
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

                console.log(commandName, 'WTF');
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
            })
            .then(function getConsignments(){
                //get consignments to find products on the consignment for maximum 2 weeks


                var connectionInfo = utils.loadOauthTokens();
                var consignments = vendSdk.consignments.stockOrders.fetchAll(connectionInfo)

                .then(function (consignments){
                  var consignmentsById = [];

                  var now = moment().format('YYYY-MM-DD');
                  var indexFortoday = moment().day();
                  var getMeToThisSunday = moment().day("Sunday").format('YYYY-MM-DD');
                  var getMeToLastSunday_NoMatterWhatTheCurrentDayOfTheWeekIs = moment().day(-7).format('YYYY-MM-DD');
                  var dateFilter = {where : {consignment_date : {gt : getMeToLastSunday_NoMatterWhatTheCurrentDayOfTheWeekIs}}};

                  var sentOrOpenFilter = {where: {status:'OPEN'}};// {inq: ['OPEN', 'SENT']}}};
                  var cleanedConsignments = loopback_filter(consignments,sentOrOpenFilter);
                  var filteredDateConsignments = loopback_filter(cleanedConsignments,dateFilter);

                  filteredDateConsignments.forEach(function(consignment){
                    //console.log(consignment.status);
                    consignmentsById.push(consignment.id);
                                        
                  })
                  console.log(commandName, 'consignmentsById.length : ',consignmentsById.length);
                  var argsForConsignments = {page: { required: false, key: 'page', value: undefined },
                                               pageSize: { required: false, key: 'page_size', value: undefined },
                                               consignmentIdIndex: {required: false,key:'consignment_index',value:undefined},
                                               consignmentIds: {required:true,key:'consignment_id',value:consignmentsById} 
                                              };
                    var consignmentProducts = vendSdk.consignments.products.fetchAllForConsignments(argsForConsignments,connectionInfo)
                    .then(function getConsignmentProducts(consignmentProducts){
                      
                      
                      consignmentProducts.forEach(function(singleConsignment){
                        if(!(consignmentIdExists(singleConsignment.product_id,consignmentProductsById)))
                        {
                          consignmentProductsById.push(singleConsignment.product_id);
                        }
                      })  
                      console.log(commandName, 'consignmentProductsById.length : ',consignmentProductsById.length);

                      function consignmentIdExists(productId,array) {
                      var i = null;
                      for (i = 0; array.length > i; i += 1) {
                            if (array[i].product_id === productId) {
                                return true;
                            }
                        }
                         
                        return false;
                      };                                          

                })
                


              })
            })
            .then(function getSales(){
              //check for zero sales


              //var sinceDate = moment.utc().subtract(3, 'months').format('YYYY-MM-DD');
              var argsForSales = vendSdk.args.sales.fetch();
              //console.log(argsForSales);
              var sinceDate = params.reportDate;
              argsForSales.since.value = sinceDate;
              //argsForSales.outletApiId.value = params.outletId;
              var connectionInfo = utils.loadOauthTokens();
              //console.log(connectionInfo);

              return vendSdk.sales.fetchAll(argsForSales,connectionInfo)
              .then(function(registerSales){
                  
                  return Promise.resolve(registerSales);    
                });

              })

            .tap(function filterSales(registerSales) {
          
              var connectionInfo = utils.loadOauthTokens();
              //console.log(connectionInfo);
              console.log(commandName, 'Register Sale : '+ registerSales.length);
                registerSales.forEach(function(singleSale){
                      var singleProductSale = singleSale.register_sale_products;
                      singleProductSale.forEach(function(sale){
                          filteredSales.push(sale);
                          //console.log(sale);
                      })
                    })

              return Promise.resolve(filteredSales);
          
            })
          .then(function findProducts()
            {
              //get all products information

              var connectionInfo = utils.loadOauthTokens();
              return vendSdk.products.fetchAll(connectionInfo)

              .then(function(products)
              {
                
                
                console.log(commandName,'Filtered sale : ' + filteredSales.length);
                var dilutedSales = [];
                filteredSales.forEach(function(singleSale){
                  //console.log("Filtered product name : "+ singleSale.name);
                  if((!(salesIdExists(singleSale.product_id,dilutedSales))))
                  {
                    dilutedSales.push(singleSale);
                  }
                })
                console.log(commandName, 'Diluted sale : ' + dilutedSales.length);

                var singleProduct = null;      
                var i=0,j=0;
                var sum = parseInt(0);
                var undefinedFilter = {where: {inventory: {neq :undefined} }};
                var cleanedProducts = loopback_filter(products,undefinedFilter);

                  cleanedProducts.forEach(function(product){
                  sum = 0;
                  if(!(salesIdExists(product.id,dilutedSales)))
                  {
                    
                    var singleProductInventory = product.inventory;
                    singleProductInventory.forEach(function(inv){
                    
                      sum = parseInt(sum) + parseInt(inv.count);
                    });
                    
                  if(sum == parseInt(0))
                  {
                    if(!(consignmentIdExists(product.id,consignmentProductsById)))
                    {
                      if(product.supplier_name != 'FFCC') {
                          if (!(productsIdExists(product.id, deleteFromVend))) {
                              deleteFromVend.push(product);
                              j++;
                          }
                      }
                    }
                   }
                  }
                })
                
                function consignmentIdExists(productId,array) {
                    var i = null;
                    for (i = 0; array.length > i; i += 1) {
                        if (array[i] === productId) {
                            return true;
                        }
                    }
                     
                    return false;
                };  


                function salesIdExists(productId,array) {
                    var i = null;
                    for (i = 0; array.length > i; i += 1) {
                        if (array[i].product_id === productId) {
                            return true;
                        }
                    }
                     
                    return false;
                };  

                function productsIdExists(productId,array) {
                    var i = null;
                    for (i = 0; array.length > i; i += 1) {
                        if (array[i].id === productId) {
                            return true;
                        }
                    }
                     
                    return false;
                };  

                console.log(commandName, 'Deletion count : ' + deleteFromVend.length);
            })
          })
          
          .catch(function (error) {
              console.error('2nd last dot-catch block');
              console.log(commandName, 'ERROR', error.stack);
              return Promise.reject(error);
            });
        }
        catch (e) 
        {
          console.error('3rd last catch block');
          console.error(commandName, e);
          console.log(commandName, 'ERROR', e.stack);
          // TODO: throw or float up promise chain or just exit the worker process here?
        }
      })
      .catch(function (error) {
        console.error('last dot-catch block');
        console.log(commandName, 'ERROR', error);
        console.log(commandName, 'ERROR', error.stack);
        process.exit(FAILURE); // this is the last one so exit the worker process
      });
  }
  catch (e) {
    console.error('2nd last catch block');
    console.error(commandName, e);
    console.log(commandName, 'ERROR', e.stack);
    // TODO: throw or float up promise chain or just exit the worker process here?
  }
}
catch (e) {
    console.error('Last catch block');
    console.error(commandName, e);
    console.log(commandName, 'ERROR', e.stack);
    // TODO: throw or float up promise chain or just exit the worker process here?
}
