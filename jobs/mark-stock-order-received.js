var Promise = require('bluebird');

var vendSdk = require('vend-nodejs-sdk')({});
var utils = require('./utils/utils.js');

var _ = require('underscore');
var path = require('path');

// Global variable for logging
var commandName = path.basename(__filename, '.js'); // gives the filename without the .js extension

var MarkStockOrderReceived = {
  desc: 'Mark a Stock Order as RECEIVED\n' +
        '\t\t\t\t\t' + '--rowId <consignmentProductId>',

  options: { // must not clash with global aliases: -t -d -f
    rowId: {
      type: 'string',
      required: true
    }
  },

  run: function (rowId, vendConsignment) {
    console.log('rowId', rowId, 'vendConsignment', vendConsignment);

    var connectionInfo = utils.loadOauthTokens();
    commandName = commandName + '-'+ connectionInfo.domainPrefix;

    var argsForStockOrder = vendSdk.args.consignments.stockOrders.markAsSent();
    argsForStockOrder.apiId.value = rowId;
    argsForStockOrder.body.value = vendConsignment;
    return vendSdk.consignments.stockOrders.markAsReceived(argsForStockOrder, connectionInfo)
      .tap(function() {
        //console.log(commandName + ' > 1st tap block');
        return utils.updateOauthTokens(connectionInfo);
      })
      .then(function (updatedStockOrder) {
        console.log(commandName + ' > updatedStockOrder', updatedStockOrder);
        return Promise.resolve(updatedStockOrder);
      })
      .catch(function(e) {
        console.error(commandName + ' > An unexpected error occurred: ', e);
      });
  }
};

module.exports = MarkStockOrderReceived;
