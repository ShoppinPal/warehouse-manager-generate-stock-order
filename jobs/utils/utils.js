var fileSystem = require('q-io/fs');
var fs = require('fs');
var Promise = require('bluebird');
var moment = require('moment');
var _ = require('underscore');
var path = require('path');
var vendSdk = require('vend-nodejs-sdk')({});

var savePayloadConfigToFiles = function(payload){
  console.log('inside savePayloadConfigToFiles()');

  var oauthFile = path.join(__dirname, '..', '..', 'config', 'oauth.json');
  console.log('oauthFile: ' + oauthFile);
  return fileSystem.write(
    oauthFile,
    JSON.stringify({
      'access_token': payload.accessToken,
      'token_type': payload.tokenType,
      'refresh_token': payload.refreshToken,
      'domain_prefix': payload.domainPrefix
    },null,2))
    .then(function(){
      var clientFile = path.join(__dirname, '..', '..', 'config', 'client.json');
      console.log('clientFile: ' + clientFile);
      return fileSystem.write(
        clientFile,
        JSON.stringify({
          'token_service': payload.tokenService,
          'client_id': payload.clientId,
          'client_secret': payload.clientSecret
        },null,2))
        .then(function(){
          // can't believe I need this code here, just to trap errors that won't float up the chain
          return Promise.resolve();
        },
        function(err){ //TODO: why don't the errors caught by this block, travel up the chain when its absent?
          console.error(err);
          return Promise.reject(err);
        });
    },
    function(err){ //TODO: why don't the errors caught by this block, travel up the chain when its absent?
      console.error(err);
      return Promise.reject(err);
    });
};

var updateOauthTokens = function(connectionInfo){
  console.log('updating oauth.json ... in case there might have been token changes');
  //console.log('connectionInfo: ' + JSON.stringify(connectionInfo,null,2));
  var oauthFile = path.join(__dirname, '..', '..', 'config', 'oauth.json');
  console.log('oauthFile: ' + oauthFile);
  return fileSystem.write(
    oauthFile,
    JSON.stringify({
      'access_token': connectionInfo.accessToken,
      'token_type': 'Bearer',
      'refresh_token': connectionInfo.refreshToken,
      'domain_prefix': connectionInfo.domainPrefix
    },null,2));
};

var loadOauthTokens = function(token, domain){
  // (1) Check for oauth.json and client.json via nconf
  var nconf = require('nconf');
  //console.log('nconf.get(): ', nconf.get());

  // (2) try to load client_id and client_secret and whatever else
  var connectionInfo = {
    domainPrefix: nconf.get('domain_prefix') || domain,
    accessToken: nconf.get('access_token') || token,
    // if you want auto-reties on 401, additional data is required:
    refreshToken: nconf.get('refresh_token'),
    vendTokenService: nconf.get('token_service'),
    vendClientId: nconf.get('client_id'),
    vendClientSecret: nconf.get('client_secret')
  };
  //console.log('connectionInfo: ', connectionInfo);

  // (3) if not successful then ask for it as CLI arguments
  if (!connectionInfo.accessToken) {
    throw new Error('--token should be set');
  }
  if (!connectionInfo.domainPrefix) {
    throw new Error('--domain should be set');
  }

  return connectionInfo;
};

var getAbsoluteFilename = function(commandName, extension){
  var nconf = require('nconf');

  var defaultOutputDirectory = nconf.get('defaultOutputDirectory');
  var timestampFiles = nconf.get('timestampFiles');

  var filename = setFilename(commandName, timestampFiles, extension);

  if (defaultOutputDirectory && defaultOutputDirectory.trim().length > 0) {
    if (!fs.existsSync(defaultOutputDirectory)){
      fs.mkdirSync(defaultOutputDirectory);
    }
    var stats = fs.statSync(defaultOutputDirectory);
    if (stats.isDirectory()) {
      filename = path.join(defaultOutputDirectory, setFilename(commandName, timestampFiles, extension));
    }
  }

  return filename;
};

var setFilename = function(commandName, timestampFiles, extension){
  var extension = extension || '.json';
  if (timestampFiles) {
    return commandName + '-' + moment.utc().format('YYYY-MMM-DD_HH-mm-ss') + extension;
  }
  else {
    return commandName + extension;
  }
};

var exportToJsonFileFormat = function(commandName, data){
  if(data !== undefined  && data !== null) {
    var filename = getAbsoluteFilename(commandName);
    console.log('saving to ' + filename);
    return fileSystem.write(filename, // save to current working directory
      JSON.stringify(data,vendSdk.replacer,2));
  }
  else {
    return Promise.reject('no data provided for exportToJsonFileFormat()');
  }
};

exports.savePayloadConfigToFiles = savePayloadConfigToFiles;
exports.getAbsoluteFilename = getAbsoluteFilename;
exports.loadOauthTokens = loadOauthTokens;
exports.updateOauthTokens = updateOauthTokens;
exports.exportToJsonFileFormat = exportToJsonFileFormat;
