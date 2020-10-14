process.title = "NSFCAREER";

// Include the cluster module
const cluster = require('cluster');

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for terminating workers
    cluster.on('exit', function (worker) {

        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();
    });

    // Code to run if we're in a worker process
} else {

    // ======================================
    //         INITIALIZING DEPENDENCIES
    // ======================================
    const express = require('express');
    app = express(),
        bodyParser = require("body-parser"),
        AWS = require('aws-sdk'),
        cookieParser = require('cookie-parser'),
        fs = require("fs"),
        path = require("path"),
        { spawn } = require('child_process'),
        multer = require('multer'),
        ms = require("ms"),
        download = require('download-file'),
        execFile = require('child_process').execFile,
        conversion = require("phantom-html-to-pdf")(),
        XLSX = require('xlsx'),
        ejs = require('ejs'),
        nodemailer = require('nodemailer'),
        jwt = require('jsonwebtoken'),
        shortid = require('shortid'),
        archiver = require('archiver'),
        moment = require('moment');

        shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$');

    var _ = require('lodash');
    var simulation_timer = 120000; // 4 minutes in milliseconds

    // ================================================
    //            SERVER CONFIGURATION
    // ================================================
    function setConnectionTimeout(time) {
        var delay = typeof time === 'string'
            ? ms(time)
            : Number(time || 5000);

        return function (req, res, next) {
            res.connection.setTimeout(delay);
            next();
        }
    }

    // ======================================
    //         	GLOBAL VARIABLES
    // ======================================

    const successMessage = "success";
    const failureMessage = "failure";
    const apiPrefix = "/api/"

    // ======================================
    //       CONFIGURING AWS SDK & EXPESS
    // ======================================
    var config = {
        "awsAccessKeyId": process.env.AWS_ACCESS_KEY_ID,
        "awsSecretAccessKey": process.env.AWS_ACCESS_SECRET_KEY,
        "avatar3dClientId": process.env.AVATAR_3D_CLIENT_ID,
        "avatar3dclientSecret": process.env.AVATAR_3D_CLIENT_SECRET,
        "region" : process.env.REGION,
        "usersbucket": process.env.USERS_BUCKET,
        "usersbucketbeta": process.env.USERS_BUCKET_BETA,
        "apiVersion" : process.env.API_VERSION,
        "jwt_secret" : process.env.JWT_SECRET,
        "email_id" : process.env.EMAIL_ID,
        "mail_list" : process.env.MAIL_LIST,
        "ComputeInstanceEndpoint" : process.env.COMPUTE_INSTANCE_ENDPOINT,
        "userPoolId": process.env.USER_POOL_ID,
        "ClientId" : process.env.CLIENT_ID,
        "react_website_url" : process.env.REACT_WEBSITE_URL,
        "simulation_result_host_url" : process.env.SIMULATION_RESULT_HOST_URL,
        "jobQueueBeta" : process.env.JOB_QUEUE_BETA,
        "jobDefinitionBeta" : process.env.JOB_DEFINITION_BETA,
        "jobQueueProduction" : process.env.JOB_QUEUE_PRODUCTION,
        "jobDefinitionProduction" : process.env.JOB_DEFINITION_PRODUCTION,
        "simulation_bucket" : process.env.SIMULATION_BUCKET,
        "queue_x" : process.env.QUEUE_X,
        "queue_y" : process.env.QUEUE_Y,
        "queue_beta" : process.env.QUEUE_BETA
    };

    const subject_signature = fs.readFileSync("data/base64")

    // var config = require('./config/configuration_keys.json');
    var config_env = config;

    //AWS.config.loadFromPath('./config/configuration_keys.json');
    const BUCKET_NAME = config_env.usersbucket;

    // AWS Credentials loaded
    var myconfig = AWS.config.update({
        accessKeyId: config_env.awsAccessKeyId, secretAccessKey: config_env.awsSecretAccessKey, region: config_env.region
    });
    var storage = multer.memoryStorage()
    var upload = multer({
        storage: storage
    });

    var s3 = new AWS.S3();
    var batch = new AWS.Batch();
    var cron = require('node-cron');

    const docClient = new AWS.DynamoDB.DocumentClient({
        convertEmptyValues: true
    });

    // NODEMAILER CONFIGURATION
    var email = config_env.email_id;
    let transport = nodemailer.createTransport({
        SES: new AWS.SES({ apiVersion: "2010-12-01" })
    })
    console.log(email, config_env.email_id_password);

    app.use(bodyParser.urlencoded({
        limit: '50mb',
        extended: true
    }));
    app.use(bodyParser.json({
        limit: '50mb',
        extended: true
    }));

    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'ejs');

    // ===========================================
    //     UTILITY FUNCTIONS
    // ===========================================

    function concatArrays(arrays) {
        return [].concat.apply([], arrays);
    }

    // Promise to delay a function or any promise
    const delay = t => new Promise(resolve => setTimeout(resolve, t));

    // Simuation related functions
    const {
        convertFileDataToJson,
        storeSensorData,
        addPlayerToTeamOfOrganization,
        uploadPlayerSelfieIfNotPresent,
        generateSimulationForPlayers,
        generateSimulationForPlayersFromJson,
        computeImageData,
        generateINP
    } = require('./controller/simulation');

    const {
        getUserDetails,
        getUserDetailBySensorId,
        getUserByPlayerId,
        updateSimulationFileStatusInDB,
        addTeam,
        deleteTeam,
        fetchAllTeamsInOrganization,
        deleteTeamFromOrganizationList,
        addTeamToOrganizationList,
        getCumulativeAccelerationData,
        getTeamDataWithPlayerRecords,
        getTeamData,
        getPlayersListFromTeamsDB,
        getCompletedJobs,
        updateJobComputedTime,
        getAllSensorBrands,
        getBrandData,
        getAllOrganizationsOfSensorBrand,
        getBrandOrganizationData,
        getAllTeamsOfOrganizationsOfSensorBrand,
        getOrganizationTeamData,
        getPlayerSimulationFile,
        removeRequestedPlayerFromOrganizationTeam,
        getPlayerSimulationStatus,
        getCumulativeAccelerationRecords,
        addPlayer,
    } = require('./controller/query');

    // Clearing the cookies
    app.get(`/`, (req, res) => {
        res.send("TesT SERVICE HERE");
    })

    app.post(`${apiPrefix}generateSimulationForSensorData`, setConnectionTimeout('10m'), function (req, res) {
        // console.log('user_cognito_id', req.body.user_cognito_id);
        let apiMode = req.body.mode;
        let mesh = req.body.mesh;
        let sensor = req.body.sensor !== undefined ? req.body.sensor : null;
        let level = req.body.level !== undefined ? req.body.level : null;
        let reader = 0;
        let filename = req.body.data_filename !== undefined ? req.body.data_filename : null;
        let buffer = '';

        if (sensor && (sensor.toLowerCase() === 'sensor_company_x' || sensor.toLowerCase() === 'swa')) {
            reader = 1;
            filename = req.body.data_filename
        }

        if (sensor && sensor === 'prevent') {
            reader = 2;
            filename = req.body.data_filename
        }

        if (req.body.upload_file) {
            // The file content will be in 'upload_file' parameter
            buffer = Buffer.from(req.body.upload_file, 'base64');
        }

        let file_extension = null;
        if (filename !== null) {
            file_extension = filename.split(".");
            file_extension = file_extension[file_extension.length - 1];
        }

        if (file_extension === 'json' || filename == null) { // Reading json from file 
            const new_items_array = file_extension === 'json' ? JSON.parse(buffer) : JSON.parse(req.body.json);
            // console.log(new_items_array);
            const sensor_data_array = [];

            // Adding image id in array data
            for (var i = 0; i < new_items_array.length; i++) {
                const _temp = new_items_array[i];

                if (level === 300) {
                    if (_temp["sensor"].toLowerCase() === 'swa') {
                        req.body.sensor_brand = 'SWA';
                    } else if (_temp["sensor"].toLowerCase() === 'sisu') {
                        req.body.sensor_brand = 'SISU';
                    } else if (_temp["sensor"].toLowerCase() === 'stanford') {
                        req.body.sensor_brand = 'Stanford';
                    } else if (_temp["sensor"].toLowerCase() === 'panther') {
                        req.body.sensor_brand = 'Panther';
                    } else if (_temp["sensor"].toLowerCase() === 'hitiq') {
                        req.body.sensor_brand = 'HitIQ';
                    } else if (_temp["sensor"].toLowerCase() === 'gforcetracker') {
                        req.body.sensor_brand = 'GForceTracker';
                    } else if (_temp["sensor"].toLowerCase() === 'fitguard') {
                        req.body.sensor_brand = 'FitGuard';
                    } else if (_temp["sensor"].toLowerCase() === 'blackbox') { 
                        req.body.sensor_brand = 'Blackbox Biometrics';
                    } else if (_temp["sensor"].toLowerCase() === 'biocore') { 
                        req.body.sensor_brand = 'BioCore';
                    } else if (_temp["sensor"].toLowerCase() === 'athlete') { 
                        req.body.sensor_brand = 'Athlete Intelligence';
                    } else if (_temp["sensor"].toLowerCase() === 'medeng') { 
                        req.body.sensor_brand = 'Med-Eng';
                    } else if (_temp["sensor"].toLowerCase() === 'hybrid3') { 
                        req.body.sensor_brand = 'Hybrid3';
                    } else {
                        req.body.sensor_brand = 'Prevent Biometrics';
                    }
                }

                let _temp_sensor_data = {};
                _temp_sensor_data["level"] = level;
                _temp_sensor_data["sensor"] = req.body.sensor_brand;
                _temp_sensor_data["impact-date"] = _temp["impact-date"];
                _temp_sensor_data["impact-time"] = _temp["impact-time"];
                _temp_sensor_data["organization"] = level === 400 ? (_temp["player"]["organization"] ? _temp["player"]["organization"] : _temp["organization"]) : req.body.organization;
                _temp_sensor_data["player"] = _temp["player"];

                _temp_sensor_data["simulation"] = {
                    "la-units": "",
                    "linear-acceleration": {},
                    "angular-acceleration": {}
                };

                _temp_sensor_data["simulation"]["linear-acceleration"] = {};

                if (_temp["simulation"]['time-units'] === 'seconds') {
                    _temp["simulation"]['time'].forEach((time, i) => {
                        const _temp_time = parseFloat(time) * 1000;
                        _temp["simulation"]['time'][i] = _temp_time;
                    })
                }

                let x_g = [];
                let y_g = [];
                let z_g = [];

                if (_temp["simulation"]['linear-acceleration']['la-units'] === 'g') {
                    _temp["simulation"]['linear-acceleration']['x-la'].forEach((la, x) => {
                        const _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['x-la'][x] = _temp_la;
                        x_g.push(parseFloat(la));
                    })

                    _temp["simulation"]['linear-acceleration']['y-la'].forEach((la, y) => {
                        const _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['y-la'][y] = _temp_la;
                        y_g.push(parseFloat(la));
                    })

                    _temp["simulation"]['linear-acceleration']['z-la'].forEach((la, z) => {
                        const _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['z-la'][z] = _temp_la;
                        z_g.push(parseFloat(la));
                    })
                } else {
                    _temp["simulation"]['linear-acceleration']['x-la'].forEach((la, x) => {
                        const _temp_la = parseFloat(la) / 9.80665;
                        x_g.push(_temp_la);
                    })

                    _temp["simulation"]['linear-acceleration']['y-la'].forEach((la, y) => {
                        const _temp_la = parseFloat(la) / 9.80665;
                        y_g.push(_temp_la);
                    })

                    _temp["simulation"]['linear-acceleration']['z-la'].forEach((la, z) => {
                        const _temp_la = parseFloat(la) / 9.80665;
                        z_g.push(_temp_la);
                    })
                }

                _temp_sensor_data["simulation"]["la-units"] = _temp["simulation"]['linear-acceleration']['la-units'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['xv'] = _temp["simulation"]['linear-acceleration']['x-la'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['xv-g'] = x_g;
                _temp_sensor_data["simulation"]["linear-acceleration"]['xt'] = _temp["simulation"]['time'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['yv'] = _temp["simulation"]['linear-acceleration']['y-la'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['yv-g'] = y_g;
                _temp_sensor_data["simulation"]["linear-acceleration"]['yt'] = _temp["simulation"]['time'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['zv'] = _temp["simulation"]['linear-acceleration']['z-la'];
                _temp_sensor_data["simulation"]["linear-acceleration"]['zv-g'] = z_g;
                _temp_sensor_data["simulation"]["linear-acceleration"]['zt'] = _temp["simulation"]['time'];

                _temp_sensor_data["simulation"]["angular-acceleration"]['xv'] = _temp["simulation"]['angular-acceleration']['x-aa-rad/s^2'];
                _temp_sensor_data["simulation"]["angular-acceleration"]['xt'] = _temp["simulation"]['time'];
                _temp_sensor_data["simulation"]["angular-acceleration"]['yv'] = _temp["simulation"]['angular-acceleration']['y-aa-rad/s^2'];
                _temp_sensor_data["simulation"]["angular-acceleration"]['yt'] = _temp["simulation"]['time'];
                _temp_sensor_data["simulation"]["angular-acceleration"]['zv'] = _temp["simulation"]['angular-acceleration']['z-aa-rad/s^2'];
                _temp_sensor_data["simulation"]["angular-acceleration"]['zt'] = _temp["simulation"]['time'];

                _temp_sensor_data["user_cognito_id"] = req.body.user_cognito_id;
                _temp_sensor_data["image_id"] = shortid.generate();
                _temp_sensor_data["player_id"] = _temp["player_id"] + '$' + Date.now();
                _temp_sensor_data["simulation_status"] = 'pending';
                _temp_sensor_data["team"] = _temp.player.team;

                if (req.body.sensor_brand === 'Prevent') {
                    _temp_sensor_data['mesh-transformation'] = ["-y", "z", "-x"];
                } else if (req.body.sensor_brand === 'Sensor Company X' || req.body.sensor_brand === 'SWA') {
                    _temp_sensor_data['mesh-transformation'] = ["-z", "x", "-y"];
                    _temp_sensor_data['angular-to-linear-frame'] = ["-y", "-x", "z"];
                } else if (req.body.sensor_brand === 'SISU') {
                    _temp_sensor_data['mesh-transformation'] = ["-z", "-x", "y"];
                } else if (req.body.sensor_brand === 'Stanford') {
                    _temp_sensor_data['mesh-transformation'] = ["y", "-z", "-x"];
                }  else if (req.body.sensor_brand === 'Hybrid3') {
                   // _temp_sensor_data['mesh-transformation'] = ["z", "-x", "-y"];
                    _temp_sensor_data['mesh-transformation'] = ["-y", "z", "-x"];
                } else {
                    _temp_sensor_data['mesh-transformation'] = ["-y", "z", "-x"];
                }

                sensor_data_array.push(_temp_sensor_data);

            }
            console.log('new_items_array is ', (sensor_data_array));

            // Stores sensor data in db 
            // TableName: "sensor_data"
            // team, player_id

            storeSensorData(sensor_data_array)
                .then(flag => {
                    var players = sensor_data_array.map(function (player) {
                        return {
                            player_id: player.player_id.split("$")[0],
                            team: player.player.team,
                            sensor: player.sensor,
                            player: player.player,
                            organization: player.player.organization ? player.player.organization : player.organization,
                        }
                    });

                    // Fetching unique players
                    const result = _.uniqBy(players, 'player_id')

                    var simulation_result_urls = [];

                    if (result.length == 0) {
                        res.send({
                            message: "success"
                        })
                    } else {
                        // Run simulation here and send data
                        // {
                        //     "player_id" : "STRING",
                        //     "team" : "STRING",
                        //     "organization" : "STRING"
                        // }
                        var counter = 0;

                        for (var i = 0; i < result.length; i++) {
                            var temp = result[i];

                            // Adds team details in db if doesn't already exist
                            addPlayerToTeamOfOrganization(level === 300 ? null : req.body.sensor_brand, req.body.user_cognito_id, temp.organization, temp.team, temp.player_id)
                                .then(d => {
                                    counter++;
                                    if (counter == result.length) {
                                        // Upload player selfie if not present and generate meshes
                                        // Generate simulation for player

                                        // Generate 10 digits unique number
                                        let account_id = Math.floor(Math.random() * 9000000000) + 1000000000;
                                        let player_id = temp.player_id + '-' + temp.sensor;
                                        getUserByPlayerId(player_id)
                                            .then (user_detail => {
                                                // console.log(user_detail);
                                                if (user_detail.length > 0) {
                                                    account_id = user_detail[0]['account_id'];
                                                    player_id = user_detail[0]['player_id'];
                                                } else {
                                                    let obj = {};
                                                    obj['user_cognito_id'] = player_id;
                                                    obj['account_id'] = account_id;
                                                    obj['player_id'] = player_id;
                                                    obj['first_name'] = temp.player['first-name'];
                                                    obj['last_name'] = temp.player['last-name'];
                                                    obj['sport'] = temp.player['sport'] ? temp.player['sport'] : '';
                                                    obj['team'] = temp.player['team'] ? temp.player['team'] : '';
                                                    obj['position'] = temp.player['position'] ? temp.player['position'] : '';
                                                    
                                                    addPlayer(obj)
                                                        .then( playerData => {
                                                            console.log('Player added in user table');
                                                        })
                                                }

                                                uploadPlayerSelfieIfNotPresent(req.body.selfie, player_id, req.body.filename, account_id)
                                                    .then((selfieDetails) => {
                                                        return generateSimulationForPlayersFromJson(sensor_data_array, apiMode, mesh, account_id);
                                                    })
                                                    .then(urls => {
                                                        simulation_result_urls.push(urls)
                                                        res.send({
                                                            message: "success",
                                                            image_url: _.spread(_.union)(simulation_result_urls)
                                                        })
                                                    })
                                                    .catch(err => {
                                                        console.log(err);
                                                        counter = result.length;
                                                        i = result.length;
                                                        res.send({
                                                            message: "failure",
                                                            error: err
                                                        })
                                                    })
                                            })
                                            .catch(err => {
                                                console.log(err);
                                                counter = result.length;
                                                i = result.length;
                                                res.send({
                                                    message: "failure",
                                                    error: err
                                                })
                                            })
                                    }
                                })
                                .catch(err => {
                                    console.log(err);
                                    counter = result.length;
                                    i = result.length;
                                    res.send({
                                        message: "failure",
                                        error: err
                                    })
                                })
                        }
                    }
                })
                .catch(err => {
                    console.log(err);
                    res.send({
                        message: "failure",
                        error: err
                    })
                })
        } else {
            if (sensor === null || sensor === '') {
                res.send({
                    message: "failure",
                    error: 'Sensor parameter is required.'
                })
            } else {
                //Converting file data into JSON
                convertFileDataToJson(buffer, reader, filename)
                    .then(items => {
                        // Adding default organization Unknown to the impact data
                        const new_items_array = _.map(items, o => _.extend({ organization: "Unknown" }, o));

                        ( async () => {
                            // Adding image id in array data
                            for (var i = 0; i < new_items_array.length; i++) {
                                var _temp = new_items_array[i];

                                if (level === 300) {
                                    if (sensor.toLowerCase() === 'sensor_company_x' || sensor.toLowerCase() === 'swa') {
                                        req.body.sensor_brand = 'SWA';
                                    } else if (sensor.toLowerCase() === 'sisu') {
                                        req.body.sensor_brand = 'SISU';
                                    } else if (sensor.toLowerCase() === 'stanford') {
                                        req.body.sensor_brand = 'Stanford';
                                    } else if (sensor.toLowerCase() === 'panther') {
                                        req.body.sensor_brand = 'Panther';
                                    } else if (sensor.toLowerCase() === 'hitiq') {
                                        req.body.sensor_brand = 'HitIQ';
                                    } else if (sensor.toLowerCase() === 'gforcetracker') {
                                        req.body.sensor_brand = 'GForceTracker';
                                    } else if (sensor.toLowerCase() === 'fitguard') {
                                        req.body.sensor_brand = 'FitGuard';
                                    } else if (sensor.toLowerCase() === 'blackbox') { 
                                        req.body.sensor_brand = 'Blackbox Biometrics';
                                    } else if (sensor.toLowerCase() === 'biocore') { 
                                        req.body.sensor_brand = 'BioCore';
                                    } else if (sensor.toLowerCase() === 'athlete') { 
                                        req.body.sensor_brand = 'Athlete Intelligence';
                                    } else if (sensor.toLowerCase() === 'medeng') { 
                                        req.body.sensor_brand = 'Med-Eng';
                                    } else if (sensor.toLowerCase() === 'hybrid3') { 
                                        req.body.sensor_brand = 'Hybrid3';
                                    } else {
                                        req.body.sensor_brand = 'Prevent Biometrics';
                                    }
                                }

                                _temp["level"] = level;
                                _temp["user_cognito_id"] = req.body.user_cognito_id;
                                _temp["sensor"] = req.body.sensor_brand;
                                _temp["image_id"] = shortid.generate();
                                _temp['player'] = {};
                                _temp['player']['first-name'] = "Unknown";
                                _temp['player']['last-name'] = "Unknown";
                                _temp['player']['sport'] = "Unknown";
                                _temp['player']['position'] = "Unknown";
                                _temp['player']['team'] = "Unknown";
                                _temp["team"] = "Unknown";

                                if (req.body.organization) {
                                    _temp['organization'] = req.body.organization
                                }

                                if (req.body.team) {
                                    _temp['player']['team'] = req.body.team
                                    _temp['team'] = req.body.team
                                }

                                await getUserDetailBySensorId(_temp["sensor"], _temp.player_id.split("$")[0])
                                    .then (user_detail => {
                                        // console.log(user_detail);
                                        if (user_detail.length > 0) {
                                            _temp['player']['first-name'] = user_detail[0]['first_name'];
                                            _temp['player']['last-name'] = user_detail[0]['last_name'];
                                            new_items_array[i] = _temp;
                                            removeRequestedPlayerFromOrganizationTeam(req.body.organization, req.body.team, user_detail[0]['user_cognito_id'])
                                                .then(data => {
                                                    // console.log(data);
                                                })
                                        }
                                    })
                                    .catch(err => {
                                        new_items_array[i] = _temp;
                                    })
                            }

                            console.log('New items array is ', new_items_array);

                            // Stores sensor data in db 
                            // TableName: "sensor_data"
                            // team, player_id

                            storeSensorData(new_items_array)
                                .then(flag => {

                                    var players = new_items_array.map(function (player) {
                                        return {
                                            player_id: player.player_id.split("$")[0],
                                            team: player.player.team,
                                            sensor: player.sensor,
                                            player: player.player,
                                            organization: player.organization,
                                        }
                                    });

                                    // Fetching unique players
                                    const result = _.uniqBy(players, 'player_id')

                                    var simulation_result_urls = [];

                                    if (result.length == 0) {
                                        res.send({
                                            message: "success"
                                        })
                                    } else {
                                        // Run simulation here and send data
                                        // {
                                        //     "player_id" : "STRING",
                                        //     "team" : "STRING",
                                        //     "organization" : "STRING"
                                        // }
                                        var counter = 0;

                                        for (var i = 0; i < result.length; i++) {
                                            var temp = result[i];

                                            // Adds team details in db if doesn't already exist
                                            addPlayerToTeamOfOrganization(level === 300 ? null : req.body.sensor_brand, req.body.user_cognito_id, temp.organization, temp.team, temp.player_id)
                                                .then(d => {
                                                    counter++;
                                                    if (counter == result.length) {
                                                        // Upload player selfie if not present and generate meshes
                                                        // Generate simulation for player

                                                        // Generate 10 digits unique number
                                                        let account_id = Math.floor(Math.random() * 9000000000) + 1000000000;
                                                        let player_id = temp.player_id + '-' + temp.sensor;
                                                        getUserByPlayerId(player_id)
                                                            .then (user_detail => {
                                                                // console.log(user_detail);
                                                                if (user_detail.length > 0) {
                                                                    account_id = user_detail[0]['account_id'];
                                                                    player_id = user_detail[0]['player_id'];
                                                                } else {
                                                                    let obj = {};
                                                                    obj['user_cognito_id'] = player_id;
                                                                    obj['account_id'] = account_id;
                                                                    obj['player_id'] = player_id;
                                                                    obj['first_name'] = temp.player['first-name'];
                                                                    obj['last_name'] = temp.player['last-name'];
                                                                    obj['sport'] = temp.player['sport'] ? temp.player['sport'] : '';
                                                                    obj['team'] = temp.player['team'] ? temp.player['team'] : '';
                                                                    obj['position'] = temp.player['position'] ? temp.player['position'] : '';                               
                                                                    
                                                                    addPlayer(obj)
                                                                        .then( playerData => {
                                                                            console.log('Player added in user table');
                                                                        })
                                                                }
                                                                uploadPlayerSelfieIfNotPresent(req.body.selfie, player_id, req.body.filename, account_id)
                                                                    .then((selfieDetails) => {
                                                                        return generateSimulationForPlayers(new_items_array, reader, apiMode, sensor, mesh, account_id);
                                                                    })
                                                                    .then(urls => {
                                                                        simulation_result_urls.push(urls)
                                                                        res.send({
                                                                            message: "success",
                                                                            image_url: _.spread(_.union)(simulation_result_urls)
                                                                        })
                                                                    })
                                                                    .catch(err => {
                                                                        console.log(err);
                                                                        counter = result.length;
                                                                        i = result.length;
                                                                        res.send({
                                                                            message: "failure",
                                                                            error: err
                                                                        })
                                                                    })
                                                            })
                                                            .catch(err => {
                                                                console.log(err);
                                                                counter = result.length;
                                                                i = result.length;
                                                                res.send({
                                                                    message: "failure",
                                                                    error: err
                                                                })
                                                            })
                                                        
                                                    }
                                                })
                                                .catch(err => {
                                                    console.log(err);
                                                    counter = result.length;
                                                    i = result.length;
                                                    res.send({
                                                        message: "failure",
                                                        error: err
                                                    })
                                                })
                                        }
                                    }
                                })
                        })();
                    })
                    .catch(err => {
                        res.send({
                            message: "failure",
                            error: "Incorrect file format"
                        })
                    })
            }
        }
    })

    // Cron to get job computation time after job completetion
    cron.schedule('*/5 * * * *', () => {
        getCompletedJobs()
            .then(simulation_data => {
                let array_size = simulation_data.length
                if (array_size > 0) {
                    simulation_data.forEach((job) => {
                        if (job.job_id !== undefined) {
                            var params = {
                                jobs: [job.job_id]
                            };
                            let cnt = 0;
                            batch.describeJobs(params, function (err, data) {
                                if (err) {
                                    console.log(err, err.stack);
                                    // res.send({
                                    //     message: "failure",
                                    //     error: err
                                    // })
                                } else {
                                    console.log(data);
                                    data = data.jobs[0];
                                    let computed_time = (data.stoppedAt - data.startedAt) // miliseconds
                                    let obj = {};
                                    obj.image_id = job.image_id;
                                    obj.computed_time = computed_time;

                                    updateJobComputedTime(obj, function (err, data) {
                                        if (err) {
                                            // res.send({
                                            //     message: "failure",
                                            //     error: err
                                            // })
                                            console.log(err);
                                        }
                                        else {
                                            cnt++;
                                            if (cnt === array_size) {
                                                // res.send({
                                                //     message: "success",
                                                //     data: data
                                                // })
                                                console.log('Success');
                                            }
                                        }
                                    })
                                }
                            })
                        }
                    })
                } else {
                    // res.send({
                    //     message: "failure",
                    //     error: "No job found"
                    // })
                    console.log('No job found');
                }
            })
            .catch(err => {
                // res.send({
                //     message: "failure",
                //     error: err
                // })
                console.log(err);
            })
    });

    app.post(`${apiPrefix}getUserDetailsForIRB`, function (req, res) {
        console.log(req.body);
        verifyToken(req.body.consent_token)
            .then(decoded_token => {
                console.log(decoded_token);
                getUserDetails(decoded_token.user_cognito_id)
                    .then(data => {
                        console.log(data);
                        res.send({
                            message: "success",
                            data: data
                        })
                    })
                    .catch(err => {
                        res.send({
                            message: "failure",
                            err: err
                        })
                    })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    err: err
                })
            })
    })

    app.post(`${apiPrefix}IRBFormGenerate`, function (req, res) {
        // console.log(req.body);
        var { user_cognito_id, age } = req.body;
        req.body["subject_signature"] = subject_signature
        let date_details = new Date().toJSON().slice(0, 10).split('-').reverse()
        req.body["date"] = date_details[1] + "/" + date_details[0] + "/" + date_details[2]
        ejs.renderFile(__dirname + '/views/IRBTemplate.ejs', { user_data: req.body }, {}, function (err, str) {
            // str => Rendered HTML string
            if (err) {
                console.log(JSON.stringify(err))
                res.send({
                    message: 'failure',
                    error: err
                })
            } else {
                conversion({
                    html: str,
                    paperSize: {
                        format: 'A4'
                    }
                }, function (err, pdf) {

                    // Gives the path of the actual stream
                    // console.log(pdf.stream.path);
                    uploadIRBForm(user_cognito_id, pdf.stream.path, `${user_cognito_id}_${Number(Date.now()).toString()}.pdf`)
                        .then(response => {
                            // Updating the IRB Form Status in DDB Record of User
                            console.log(response);
                            return updateSimulationFileStatusInDB({ user_cognito_id: user_cognito_id })
                        })
                        .then(response => {
                            // Send mail here
                            console.log(response);
                            return generateJWToken({ user_cognito_id: user_cognito_id }, "365d")
                        })
                        .then(token => {
                            if (req.body.isIRBComplete == true) {
                                // Send IRB form completion mail of minor

                                // subject
                                let subject = `NSFCAREER IRB :\n ${req.body.first_name} ${req.body.last_name}`

                                // link
                                let link = ` ${req.body.first_name} ${req.body.last_name} signed up. IRB Form of Minor Complete `
                                console.log('Sending mail');

                                // Send mail
                                return sendMail(config_env.mail_list, subject, link, "IRB_CONSENT.pdf", pdf.stream.path)

                            } else {

                                if (age > 18) {

                                    // subject
                                    let subject = `NSFCAREER IRB :\n ${req.body.first_name} ${req.body.last_name}`

                                    // link
                                    let link = ` ${req.body.first_name} ${req.body.last_name} signed up `
                                    console.log('Sending mail');

                                    // Send mail
                                    return sendMail(config_env.mail_list, subject, link, "IRB_CONSENT.pdf", pdf.stream.path)

                                } else {

                                    // Send consent form link to guardian
                                    let link = `Please click on the below provided link to confirm minor's account :\n ${config_env.react_website_url}IRBParentConsent?key=${token}`;
                                    ejs.renderFile(__dirname + '/views/ConfirmMinorAccount.ejs', { data: { url: `${config_env.react_website_url}IRBParentConsent?key=${token}` } }, {}, function (err, str) {
                                        if (err) {
                                            res.send({
                                                message: "failure",
                                                error: err
                                            })
                                        }
                                        else {

                                            sendMail(req.body.guardian_mail, "IRB FORM CONSENT APPLICATION", str, "IRB_CONSENT.pdf", pdf.stream.path)
                                                .then(response => {
                                                    res.send({
                                                        message: "success",
                                                        data: response
                                                    })
                                                })
                                                .catch(err => {
                                                    res.send({
                                                        message: "failure",
                                                        data: err
                                                    })
                                                })
                                        }
                                    })
                                }
                            }
                        })
                        .then(response => {
                            res.send({
                                message: "success",
                                data: response
                            })
                        })
                        .catch(err => {
                            console.log(err);
                            res.send({
                                message: "failure",
                                data: err
                            })
                        })
                });
            }
        });
    })

    app.post(`${apiPrefix}computeImageData`, setConnectionTimeout('10m'), function (req, res) {
        computeImageData(req)
            .then((data) => {
                res.send({
                    message: "success"
                });
            })
            .catch((err) => {
                res.send({
                    message: "failure",
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}generateINF`, function (req, res) {
        console.log(req.body);
        generateINP(req.body.user_id).then((d) => {
            res.send({
                message: "success",
                data: d
            })
        }).catch((err) => {
            console.log(err);
            res.send({
                message: "failure",
                error: err
            })
        })
    })

    app.post(`${apiPrefix}generateSimulation`, function (req, res) {
        console.log(req.body);
        generateSimulationFile(req.body.user_id).then((d) => {
            res.send({
                message: "success",
                data: d
            })
        }).catch((err) => {
            console.log(err);
            res.send({
                message: "failure",
                error: err
            })
        })
    })

    app.post(`${apiPrefix}getSimulationStatusCount`, function (req, res) {
        console.log(req.body);

        let completed = 0;
        let failed = 0;
        let pending = 0;

        getTeamData(req.body)
            .then(sensor_data => {
                let k = 0
                if (sensor_data.length > 0) {
                    sensor_data.forEach(function (record, index) {
                        getPlayerSimulationFile(record)
                            .then(simulation => {
                                k++;
                                if (simulation.status === 'pending') {
                                    pending++;
                                } else if (simulation.status === 'completed') {
                                    completed++;
                                } else {
                                    failed++;
                                }
    
                                if (k == sensor_data.length) {
                                    res.send({
                                        message: "success",
                                        data: {
                                            completed: completed,
                                            failed: failed,
                                            pending: pending
                                        }
                                    })
                                }
                            })
                            .catch(err => {
                                res.send({
                                    message: "failure",
                                    error: err,
                                    data: {
                                        completed: 0,
                                        failed: 0,
                                        pending: 0
                                    }
                                })
                            })
                    })
                } else {
                    res.send({
                        message: "success",
                        data: {
                            completed: 0,
                            failed: 0,
                            pending: 0
                        }
                    })
                }
                
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    error: err,
                    data: {
                        completed: 0,
                        failed: 0,
                        pending: 0
                    }
                })
            })
    }) 

    app.post(`${apiPrefix}getCumulativeAccelerationData`, function (req, res) {
        console.log(req.body);
        // getCumulativeAccelerationData(req.body)
        //     .then(data => {
        //         let linear_accelerations = data.map(function (impact_data) {
        //             return impact_data.linear_acceleration_pla
        //         });

        //         let angular_accelerations = data.map(function (impact_data) {
        //             return impact_data.angular_acceleration_paa
        //         });
        //         var sorted_acceleration_data = customInsertionSortForGraphData(angular_accelerations, linear_accelerations)
        //         res.send({
        //             message: "success",
        //             data: {
        //                 linear_accelerations: sorted_acceleration_data.array_X,
        //                 angular_accelerations: sorted_acceleration_data.array_Y
        //             }
        //         })
        //     })
        getCumulativeAccelerationData(req.body)
            .then(data => {
                res.send({
                    message: "success",
                    data: data[0],
                    simulationCount: data.length
                })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    data: {},
                    simulationCount:0,
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}getPlayersDetails`, function (req, res) {

        getPlayersListFromTeamsDB(req.body)
            .then(data => {
                let player_list = [];
                let requested_player_list = [];
                data.forEach(function (u) {
                    if (u.player_list) {
                        if (req.body.brand && u.sensor === req.body.brand) {
                            player_list = player_list.concat(u.player_list);
                        }
                        if (!req.body.brand) {
                            player_list = player_list.concat(u.player_list);
                        }
                        
                    }
                    if (u.requested_player_list) {
                        requested_player_list = requested_player_list.concat(u.requested_player_list);
                    }
                }) 
                console.log('player_list', player_list);
                console.log('requested_player_list', requested_player_list);
                // let player_list = data[0].player_list ? data[0].player_list : [];
                if (player_list.length == 0) {
                    let requested_players = []
                    if (requested_player_list.length > 0) {
                        let p_cnt = 0;
                        requested_player_list.forEach(function (p_record) {
                            getUserDetails(p_record)
                                .then (user_detail => {
                                    p_cnt++; 
                                    requested_players.push(user_detail.Item);

                                    if (p_cnt === requested_player_list.length) {
                                        res.send({
                                            message: "success",
                                            data: [],
                                            requested_players: requested_players
                                        })
                                    }
                                })
                        })         
                    } else {
                        res.send({
                            message: "success",
                            data: [],
                            requested_players: []
                        })
                    }
                }
                else {
                    var counter = 0;
                    var p_data = [];
                    player_list.forEach(function (player, index) {
                        let p = player;
                        let i = index;
                        let playerData = '';
                        getTeamDataWithPlayerRecords({ player_id: p, team: req.body.team_name, sensor: req.body.brand, organization: req.body.organization })
                            .then(player_data => {
                                playerData = player_data;
                                counter++;
                                p_data.push({
                                    date_time: playerData[0].player_id.split('$')[1],
                                    simulation_data: playerData,
                                });
                                if (counter == player_list.length) {
                                    p_data.sort(function (b, a) {
                                        var keyA = a.date_time,
                                            keyB = b.date_time;
                                        if (keyA < keyB) return -1;
                                        if (keyA > keyB) return 1;
                                        return 0;
                                    });

                                    let k = 0;
                                    p_data.forEach(function (record, index) {
                                        getPlayerSimulationFile(record.simulation_data[0])
                                            .then(simulation => {
                                                p_data[index]['simulation_data'][0]['simulation_status'] = simulation ? simulation.status : '';
                                                p_data[index]['simulation_data'][0]['computed_time'] = simulation ? simulation.computed_time : '';

                                                getUserDetailBySensorId(record.simulation_data[0]['sensor'], record.simulation_data[0].player_id.split('$')[0])
                                                    .then (u_detail => {
                                                        p_data[index]['simulation_data'][0]['user_data'] = u_detail.length > 0 ? u_detail[0] : '';
                                                        k++;
                                                        if (k == p_data.length) {
                                                            let requested_players = []
                                                            if (requested_player_list.length > 0) {
                                                                let p_cnt = 0;
                                                                requested_player_list.forEach(function (p_record) {
                                                                    getUserDetails(p_record)
                                                                        .then (user_detail => {
                                                                            p_cnt++; 
                                                                            requested_players.push(user_detail.Item);
        
                                                                            if (p_cnt === requested_player_list.length) {
                                                                                res.send({
                                                                                    message: "success",
                                                                                    data: p_data,
                                                                                    requested_players: requested_players
                                                                                })
                                                                            }
                                                                        })
                                                                })         
                                                            } else {
                                                                res.send({
                                                                    message: "success",
                                                                    data: p_data,
                                                                    requested_players: requested_players
                                                                })
                                                            }
                                                        }

                                                    })
                                            })
                                    })
                                }
                            })
                            .catch(err => {
                                counter++;
                                if (counter == player_list.length) {
                                    res.send({
                                        message: "failure",
                                        data: p_data,
                                        requested_players: []
                                    })
                                }
                            })
                    })
                }
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    error: err
                })
            });
    })

    app.post(`${apiPrefix}getCumulativeAccelerationTimeData`, function (req, res) {

        getCumulativeAccelerationData(req.body)
            .then(data => {
                let linear_accelerations = data.map(function (impact_data) {
                    return impact_data.linear_acceleration_pla
                });

                // X- Axis Linear Acceleration
                let max_linear_acceleration = Math.max(...linear_accelerations);
                // Y Axis timestamp
                let time = [0, 20, 40];

                res.send({
                    message: "success",
                    data: {
                        linear_accelerations: [0, max_linear_acceleration, 0],
                        time: time
                    }
                })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    data: {
                        linear_accelerations: [],
                        time: []
                    },
                    error: err
                })
            })
    })
    app.post(`${apiPrefix}getBrainSimulationLogFile`, function (req, res) {
        const { image_id } = req.body
        console.log('getBrainSimulationLogFile',image_id)
        getPlayerSimulationFile(req.body)
        .then(imageData => {
            // console.log('image_data',imageData)
            if (imageData.log_path && imageData.log_path != 'null') {
                let key = imageData.log_path;
                key = key.replace(/'/g, "");
                return getFileFromS3(key, imageData.bucket_name);
            } else {
                if (imageData.root_path && imageData.root_path != 'null') {
                    let log_path = imageData.root_path + 'logs/femtech_' + imageData.image_id + '.log';
                    return getFileFromS3(log_path, imageData.bucket_name);
                }
            }
        }) .then(log_s3 => {
            let log = '';
            if (log_s3) {
                log = Buffer.from(log_s3.Body).toString('utf8');
                // console.log('body',body)
            }
            res.send({
                message: "success",
                data: log,
            })
        }).catch(err =>{
            res.send({
                message: "failure",
                data: '',
                error: err
            })
        })
    })
    app.post(`${apiPrefix}getAllCumulativeAccelerationJsonData`, function (req, res) {
        console.log('getAllCumulativeAccelerationJsonData',req.body)
        getCumulativeAccelerationData(req.body)
            .then(data => {
                data.forEach(function (acc_data) {
                    let accData = acc_data;
                    let imageData = '';
                    let outputFile = '';
                    getPlayerSimulationFile(acc_data)
                    .then(file_data => {
                        // console.log('image_data',image_data)
                        imageData = file_data;
                        
                        if (imageData.ouput_file_path && imageData.ouput_file_path != 'null') {
                            let file_path = image_data.ouput_file_path;
                            file_path = file_path.replace(/'/g, "");
                            return getFileFromS3(file_path, imageData.bucket_name);
                        } else {
                            if (imageData.root_path && imageData.root_path != 'null') {
                                let summary_path = imageData.root_path + imageData.image_id + '_ouput.json';
                                return getFileFromS3(summary_path, imageData.bucket_name);
                            }
                        }
                    }).then(output_file => {
                        outputFile = output_file;
                        if (output_file)
                            outputFile = JSON.parse(outputFile.Body.toString('utf-8'));
                        console.log('outputFile',outputFile)
                        // if (imageData.path && imageData.path != 'null')
                        //     return getFileFromS3(imageData.path, imageData.bucket_name);
                        res.send({
                            message: "success",
                            data: {
                                'JsonFile':outputFile
                            }
                        })
                    })
                    // .catch(err => {
                    //     res.send({
                    //         message: "failure",
                    //         error: err
                    //     })
                    // })
                })

                
            }).catch(err => {
             
                res.send({
                    message: "failure",
                    error: err
                })
            })
    });
    app.post(`${apiPrefix}getAllCumulativeAccelerationTimeRecords`, function (req, res) {

        getCumulativeAccelerationData(req.body)
            .then(data => {
                let acceleration_data_list = [];
                // let frontal_Lobe = [];
                let brainRegions = {};
                let principal_max_strain = {};
                let principal_min_strain = {};
                let axonal_strain_max = {};
                let csdm_max = {};
                let masXsr_15_max = {};
                let cnt = 1;

                if (data.length === 0){
                    brainRegions['principal-max-strain'] = {};
                    brainRegions['principal-min-strain'] = {};
                    brainRegions['axonal-strain-max'] = {};
                    brainRegions['csdm-max'] = {};
                    brainRegions['masXsr-15-max'] = {};
                    
                    res.send({
                        message: "success",
                        data: acceleration_data_list,
                        // frontal_Lobe: frontal_Lobe,
                        brainRegions: brainRegions
                    })
                }

                data.forEach(function (acc_data, acc_index) {
                    let accData = acc_data;
                    let imageData = '';
                    let outputFile = '';
                    let jsonOutputFile = '';
                    let simulationImage = '';
                    getPlayerSimulationFile(acc_data)
                    .then(image_data => {
                        imageData = image_data;
                        console.log(acc_index, imageData.player_name);
                        if (acc_index === 0 && imageData.player_name && imageData.player_name != 'null') {
                            console.log(imageData.player_name + '/simulation/summary.json');
                            let file_path = imageData.player_name + '/simulation/summary.json';
                            return getFileFromS3(file_path, imageData.bucket_name);
                        }
                    })
                   .then(output_file => {
                        if (output_file)
                            outputFile = output_file;
                        // if (imageData.path && imageData.path != 'null') {
                        //     return getFileFromS3(imageData.path, imageData.bucket_name);
                        // } else {
                        //     if (imageData.root_path && imageData.root_path != 'null') {
                        //         let image_path = imageData.root_path + imageData.image_id + '.png';
                        //         return getFileFromS3(image_path, imageData.bucket_name);
                        //     }
                        // }
                    })
                    .then(image_s3 => {
                        // if (image_s3) {
                        //     return getImageFromS3Buffer(image_s3);
                        // }
                    })
                    .then(image => {
                        simulationImage = image;

                        // if (imageData.ouput_file_path && imageData.ouput_file_path != 'null') {
                        //     let file_path = imageData.ouput_file_path;
                        //     file_path = file_path.replace(/'/g, "");
                        //     return getFileFromS3(file_path, imageData.bucket_name);
                        // } else {
                        //     if (imageData.root_path && imageData.root_path != 'null') {
                        //         let summary_path = imageData.root_path + imageData.image_id + '_output.json';
                        //         summary_path = summary_path.replace(/'/g, "");
                        //         console.log('summary_path',summary_path)
                        //         return getFileFromS3(summary_path, imageData.bucket_name);
                        //     }
                        // }
                    }).then(json_output_file => {
                        if (json_output_file){
                            jsonOutputFile = JSON.parse(json_output_file.Body.toString('utf-8'));
                        }
                        // X- Axis Linear Acceleration
                        let linear_acceleration = accData['impact-date'] ? accData.simulation['linear-acceleration'] : accData['linear-acceleration'];
                        // X- Axis Angular Acceleration
                        let angular_acceleration = accData['impact-date'] ? accData.simulation['angular-acceleration'] : accData['angular-acceleration'];
                        // Y Axis timestamp
                        let time = accData['impact-date'] ? accData.simulation['linear-acceleration']['xt'] : accData['linear-acceleration']['xt'];
                        time = time ? time : [];
                        
                        // console.log(time);
                        time.forEach((t, i) => {
                            var _temp_time = parseFloat(t).toFixed(1);
                            time[i] = _temp_time;
                        })

                        acceleration_data_list.push({
                            linear_acceleration: linear_acceleration,
                            angular_acceleration: angular_acceleration,
                            time: time,
                            simulation_image: simulationImage ? simulationImage : '',
                            jsonOutputFile: jsonOutputFile ? jsonOutputFile : '',
                            //simulation_output_data: outputFile ? JSON.parse(outputFile.Body.toString('utf-8')) : '',
                            timestamp: accData.date,
                            record_time: accData.time,
                            sensor_data: accData,
                            date_time: accData.player_id.split('$')[1]
                        })

                        if (acc_index === 0 && outputFile) {
                            outputFile = JSON.parse(outputFile.Body.toString('utf-8'));
                            if (outputFile.Insults) {
                                outputFile.Insults.forEach(function (summary_data, index) {
                                    if (summary_data['principal-max-strain'] && summary_data['principal-max-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-max-strain'].location[0];
                                        coordinate.y = summary_data['principal-max-strain'].location[1];
                                        coordinate.z = summary_data['principal-max-strain'].location[2];
                                        region = summary_data['principal-max-strain']['brain-region'].toLowerCase();
                                        principal_max_strain[region] = principal_max_strain[region] || [];
                                        principal_max_strain[region].push(coordinate);
                                    }
                                    if (summary_data['principal-min-strain'] && summary_data['principal-min-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-min-strain'].location[0];
                                        coordinate.y = summary_data['principal-min-strain'].location[1];
                                        coordinate.z = summary_data['principal-min-strain'].location[2];
                                        region = summary_data['principal-min-strain']['brain-region'].toLowerCase();
                                        principal_min_strain[region] = principal_min_strain[region] || [];
                                        principal_min_strain[region].push(coordinate);
                                    }
                                    if (summary_data['axonal-strain-max'] && summary_data['axonal-strain-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['axonal-strain-max'].location[0];
                                        coordinate.y = summary_data['axonal-strain-max'].location[1];
                                        coordinate.z = summary_data['axonal-strain-max'].location[2];
                                        region = summary_data['axonal-strain-max']['brain-region'].toLowerCase();
                                        axonal_strain_max[region] = axonal_strain_max[region] || [];
                                        axonal_strain_max[region].push(coordinate);
                                    }
                                    if (summary_data['csdm-max'] && summary_data['csdm-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['csdm-max'].location[0];
                                        coordinate.y = summary_data['csdm-max'].location[1];
                                        coordinate.z = summary_data['csdm-max'].location[2];
                                        region = summary_data['csdm-max']['brain-region'].toLowerCase();
                                        csdm_max[region] = csdm_max[region] || [];
                                        csdm_max[region].push(coordinate);
                                    }
                                    if (summary_data['masXsr-15-max'] && summary_data['masXsr-15-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['masXsr-15-max'].location[0];
                                        coordinate.y = summary_data['masXsr-15-max'].location[1];
                                        coordinate.z = summary_data['masXsr-15-max'].location[2];
                                        region = summary_data['masXsr-15-max']['brain-region'].toLowerCase();
                                        masXsr_15_max[region] = masXsr_15_max[region] || [];
                                        masXsr_15_max[region].push(coordinate);
                                    }
                                })
                            }
                        }

                        brainRegions['principal-max-strain'] = principal_max_strain;
                        brainRegions['principal-min-strain'] = principal_min_strain;
                        brainRegions['axonal-strain-max'] = axonal_strain_max;
                        brainRegions['csdm-max'] = csdm_max;
                        brainRegions['masXsr-15-max'] = masXsr_15_max;

                        // console.log('brainRegions', JSON.stringify(brainRegions));

                        if (data.length === cnt) {
                            acceleration_data_list.sort(function(b, a) {
                                var keyA = a.date_time,
                                keyB = b.date_time;
                                if (keyA < keyB) return -1;
                                if (keyA > keyB) return 1;
                                return 0;
                            });
                            res.send({
                                message: "success",
                                data: acceleration_data_list,
                                // frontal_Lobe: frontal_Lobe,
                                brainRegions: brainRegions
                            })
                        }

                        cnt++;
                    })
                })
               
            })
            .catch(err => {
                var acceleration_data_list = [];
                acceleration_data_list.push({
                    linear_acceleration: [],
                    angular_acceleration: [],
                    time: '',
                    simulation_image: '',
                    timestamp: '',
                    record_time: '',
                    sensor_data: ''
                })
                let brainRegions = {};
                brainRegions['principal-max-strain'] = {};
                brainRegions['principal-min-strain'] = {};
                brainRegions['axonal-strain-max'] = {};
                brainRegions['csdm-max'] = {};
                brainRegions['masXsr-15-max'] = {};

                res.send({
                    message: "failure",
                    data: acceleration_data_list,
                    brainRegions: brainRegions,
                    error: err
                })
            })
    })
    
    app.post(`${apiPrefix}getCumulativeAccelerationTimeRecords`, function (req, res) {

        getCumulativeAccelerationRecords(req.body)
            .then(data => {
                let acceleration_data_list = [];
                // let frontal_Lobe = [];
                let brainRegions = {};
                let principal_max_strain = {};
                let principal_min_strain = {};
                let axonal_strain_max = {};
                let csdm_max = {};
                let masXsr_15_max = {};
                let cnt = 1;

                if (data.length === 0){
                    brainRegions['principal-max-strain'] = {};
                    brainRegions['principal-min-strain'] = {};
                    brainRegions['axonal-strain-max'] = {};
                    brainRegions['csdm-max'] = {};
                    brainRegions['masXsr-15-max'] = {};
                    
                    res.send({
                        message: "success",
                        data: acceleration_data_list,
                        // frontal_Lobe: frontal_Lobe,
                        brainRegions: brainRegions
                    })
                }

                data.forEach(function (acc_data, acc_index) {
                    let accData = acc_data;
                    let imageData = '';
                    let outputFile = '';
                    let jsonOutputFile = '';
                    let simulationImage = '';
                    getPlayerSimulationFile(acc_data)
                    .then(image_data => {
                        imageData = image_data;
                        console.log(acc_index, imageData.player_name);
                        if (acc_index === 0 && imageData.player_name && imageData.player_name != 'null') {
                            console.log(imageData.player_name + '/simulation/summary.json');
                            let file_path = imageData.player_name + '/simulation/summary.json';
                            return getFileFromS3(file_path, imageData.bucket_name);
                        }
                    })
                   .then(output_file => {
                        if (output_file)
                            outputFile = output_file;
                        // if (imageData.path && imageData.path != 'null') {
                        //     return getFileFromS3(imageData.path, imageData.bucket_name);
                        // } else {
                        //     if (imageData.root_path && imageData.root_path != 'null') {
                        //         let image_path = imageData.root_path + imageData.image_id + '.png';
                        //         return getFileFromS3(image_path, imageData.bucket_name);
                        //     }
                        // }
                    })
                    .then(image_s3 => {
                        // if (image_s3) {
                        //     return getImageFromS3Buffer(image_s3);
                        // }
                    })
                    .then(image => {
                        simulationImage = image;

                        // if (imageData.ouput_file_path && imageData.ouput_file_path != 'null') {
                        //     let file_path = imageData.ouput_file_path;
                        //     file_path = file_path.replace(/'/g, "");
                        //     return getFileFromS3(file_path, imageData.bucket_name);
                        // } else {
                        //     if (imageData.root_path && imageData.root_path != 'null') {
                        //         let summary_path = imageData.root_path + imageData.image_id + '_output.json';
                        //         summary_path = summary_path.replace(/'/g, "");
                        //         console.log('summary_path',summary_path)
                        //         return getFileFromS3(summary_path, imageData.bucket_name);
                        //     }
                        // }
                    }).then(json_output_file => {
                        if (json_output_file){
                            jsonOutputFile = JSON.parse(json_output_file.Body.toString('utf-8'));
                        }
                        // X- Axis Linear Acceleration
                        let linear_acceleration = accData['impact-date'] ? accData.simulation['linear-acceleration'] : accData['linear-acceleration'];
                        // X- Axis Angular Acceleration
                        let angular_acceleration = accData['impact-date'] ? accData.simulation['angular-acceleration'] : accData['angular-acceleration'];
                        // Y Axis timestamp
                        let time = accData['impact-date'] ? accData.simulation['linear-acceleration']['xt'] : accData['linear-acceleration']['xt'];
                        time = time ? time : [];
                        
                        // console.log(time);
                        time.forEach((t, i) => {
                            var _temp_time = parseFloat(t).toFixed(1);
                            time[i] = _temp_time;
                        })

                        acceleration_data_list.push({
                            linear_acceleration: linear_acceleration,
                            angular_acceleration: angular_acceleration,
                            time: time,
                            simulation_image: simulationImage ? simulationImage : '',
                            jsonOutputFile: jsonOutputFile ? jsonOutputFile : '',
                            //simulation_output_data: outputFile ? JSON.parse(outputFile.Body.toString('utf-8')) : '',
                            timestamp: accData.date,
                            record_time: accData.time,
                            sensor_data: accData,
                            date_time: accData.player_id.split('$')[1]
                        })

                        if (acc_index === 0 && outputFile) {
                            outputFile = JSON.parse(outputFile.Body.toString('utf-8'));
                            if (outputFile.Insults) {
                                outputFile.Insults.forEach(function (summary_data, index) {
                                    if (summary_data['principal-max-strain'] && summary_data['principal-max-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-max-strain'].location[0];
                                        coordinate.y = summary_data['principal-max-strain'].location[1];
                                        coordinate.z = summary_data['principal-max-strain'].location[2];
                                        region = summary_data['principal-max-strain']['brain-region'].toLowerCase();
                                        principal_max_strain[region] = principal_max_strain[region] || [];
                                        principal_max_strain[region].push(coordinate);
                                    }
                                    if (summary_data['principal-min-strain']  && summary_data['principal-min-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-min-strain'].location[0];
                                        coordinate.y = summary_data['principal-min-strain'].location[1];
                                        coordinate.z = summary_data['principal-min-strain'].location[2];
                                        region = summary_data['principal-min-strain']['brain-region'].toLowerCase();
                                        principal_min_strain[region] = principal_min_strain[region] || [];
                                        principal_min_strain[region].push(coordinate);
                                    }
                                    if (summary_data['axonal-strain-max'] && summary_data['axonal-strain-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['axonal-strain-max'].location[0];
                                        coordinate.y = summary_data['axonal-strain-max'].location[1];
                                        coordinate.z = summary_data['axonal-strain-max'].location[2];
                                        region = summary_data['axonal-strain-max']['brain-region'].toLowerCase();
                                        axonal_strain_max[region] = axonal_strain_max[region] || [];
                                        axonal_strain_max[region].push(coordinate);
                                    }
                                    if (summary_data['csdm-max'] && summary_data['csdm-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['csdm-max'].location[0];
                                        coordinate.y = summary_data['csdm-max'].location[1];
                                        coordinate.z = summary_data['csdm-max'].location[2];
                                        region = summary_data['csdm-max']['brain-region'].toLowerCase();
                                        csdm_max[region] = csdm_max[region] || [];
                                        csdm_max[region].push(coordinate);
                                    }
                                    if (summary_data['masXsr-15-max'] && summary_data['masXsr-15-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['masXsr-15-max'].location[0];
                                        coordinate.y = summary_data['masXsr-15-max'].location[1];
                                        coordinate.z = summary_data['masXsr-15-max'].location[2];
                                        region = summary_data['masXsr-15-max']['brain-region'].toLowerCase();
                                        masXsr_15_max[region] = masXsr_15_max[region] || [];
                                        masXsr_15_max[region].push(coordinate);
                                    }
                                })
                            }
                        }

                        brainRegions['principal-max-strain'] = principal_max_strain;
                        brainRegions['principal-min-strain'] = principal_min_strain;
                        brainRegions['axonal-strain-max'] = axonal_strain_max;
                        brainRegions['csdm-max'] = csdm_max;
                        brainRegions['masXsr-15-max'] = masXsr_15_max;

                        // console.log('brainRegions', JSON.stringify(brainRegions));

                        if (data.length === cnt) {
                            acceleration_data_list.sort(function(b, a) {
                                var keyA = a.date_time,
                                keyB = b.date_time;
                                if (keyA < keyB) return -1;
                                if (keyA > keyB) return 1;
                                return 0;
                            });
                            res.send({
                                message: "success",
                                data: acceleration_data_list,
                                // frontal_Lobe: frontal_Lobe,
                                brainRegions: brainRegions
                            })
                        }

                        cnt++;
                    })
                })
               
            })
            .catch(err => {
                var acceleration_data_list = [];
                acceleration_data_list.push({
                    linear_acceleration: [],
                    angular_acceleration: [],
                    time: '',
                    simulation_image: '',
                    timestamp: '',
                    record_time: '',
                    sensor_data: ''
                })
                let brainRegions = {};
                brainRegions['principal-max-strain'] = {};
                brainRegions['principal-min-strain'] = {};
                brainRegions['axonal-strain-max'] = {};
                brainRegions['csdm-max'] = {};
                brainRegions['masXsr-15-max'] = {};

                res.send({
                    message: "failure",
                    data: acceleration_data_list,
                    brainRegions: brainRegions,
                    error: err
                })
            })
    })
    app.post(`${apiPrefix}AllCumulativeAccelerationTimeRecords`, function (req, res) {

        getCumulativeAccelerationData(req.body)
            .then(data => {
                let acceleration_data_list = [];
                // let frontal_Lobe = [];
                let brainRegions = {};
                let principal_max_strain = {};
                let principal_min_strain = {};
                let axonal_strain_max = {};
                let csdm_max = {};
                let masXsr_15_max = {};
                let cnt = 1;

                if (data.length === 0){
                    brainRegions['principal-max-strain'] = {};
                    brainRegions['principal-min-strain'] = {};
                    brainRegions['axonal-strain-max'] = {};
                    brainRegions['csdm-max'] = {};
                    brainRegions['masXsr-15-max'] = {};
                    
                    res.send({
                        message: "success",
                        data: acceleration_data_list,
                        // frontal_Lobe: frontal_Lobe,
                        brainRegions: brainRegions
                    })
                }

                data.forEach(function (acc_data, acc_index) {
                    let accData = acc_data;
                    let imageData = '';
                    let outputFile = '';
                    let jsonOutputFile = '';
                    let simulationImage = '';
                    getPlayerSimulationFile(acc_data)
                    .then(image_data => {
                        imageData = image_data;
                        console.log(acc_index, imageData.player_name);
                        if (acc_index === 0 && imageData.player_name && imageData.player_name != 'null') {
                            console.log(imageData.player_name + '/simulation/summary.json');
                            let file_path = imageData.player_name + '/simulation/summary.json';
                            return getFileFromS3(file_path, imageData.bucket_name);
                        }
                    })
                   .then(output_file => {
                        if (output_file) outputFile = output_file;
                        acceleration_data_list.push({
                            sensor_data: accData,   
                            status: imageData ? imageData.status : '',
                            computed_time : imageData ? imageData.computed_time : '',
                            date_time: accData.player_id.split('$')[1]
                        })

                        if (acc_index === 0 && outputFile) {
                            outputFile = JSON.parse(outputFile.Body.toString('utf-8'));
                            if (outputFile.Insults) {
                                outputFile.Insults.forEach(function (summary_data, index) {
                                    if (summary_data['principal-max-strain'] && summary_data['principal-max-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-max-strain'].location[0];
                                        coordinate.y = summary_data['principal-max-strain'].location[1];
                                        coordinate.z = summary_data['principal-max-strain'].location[2];
                                        region = summary_data['principal-max-strain']['brain-region'].toLowerCase();
                                        principal_max_strain[region] = principal_max_strain[region] || [];
                                        principal_max_strain[region].push(coordinate);
                                    }
                                    if (summary_data['principal-min-strain'] && summary_data['principal-min-strain'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['principal-min-strain'].location[0];
                                        coordinate.y = summary_data['principal-min-strain'].location[1];
                                        coordinate.z = summary_data['principal-min-strain'].location[2];
                                        region = summary_data['principal-min-strain']['brain-region'].toLowerCase();
                                        principal_min_strain[region] = principal_min_strain[region] || [];
                                        principal_min_strain[region].push(coordinate);
                                    }
                                    if (summary_data['axonal-strain-max'] && summary_data['axonal-strain-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['axonal-strain-max'].location[0];
                                        coordinate.y = summary_data['axonal-strain-max'].location[1];
                                        coordinate.z = summary_data['axonal-strain-max'].location[2];
                                        region = summary_data['axonal-strain-max']['brain-region'].toLowerCase();
                                        axonal_strain_max[region] = axonal_strain_max[region] || [];
                                        axonal_strain_max[region].push(coordinate);
                                    }
                                    if (summary_data['csdm-max'] && summary_data['csdm-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['csdm-max'].location[0];
                                        coordinate.y = summary_data['csdm-max'].location[1];
                                        coordinate.z = summary_data['csdm-max'].location[2];
                                        region = summary_data['csdm-max']['brain-region'].toLowerCase();
                                        csdm_max[region] = csdm_max[region] || [];
                                        csdm_max[region].push(coordinate);
                                    }
                                    if (summary_data['masXsr-15-max'] && summary_data['masXsr-15-max'].location) {
                                        let coordinate = {};
                                        coordinate.x = summary_data['masXsr-15-max'].location[0];
                                        coordinate.y = summary_data['masXsr-15-max'].location[1];
                                        coordinate.z = summary_data['masXsr-15-max'].location[2];
                                        region = summary_data['masXsr-15-max']['brain-region'].toLowerCase();
                                        masXsr_15_max[region] = masXsr_15_max[region] || [];
                                        masXsr_15_max[region].push(coordinate);
                                    }
                                })
                            }
                        }

                        brainRegions['principal-max-strain'] = principal_max_strain;
                        brainRegions['principal-min-strain'] = principal_min_strain;
                        brainRegions['axonal-strain-max'] = axonal_strain_max;
                        brainRegions['csdm-max'] = csdm_max;
                        brainRegions['masXsr-15-max'] = masXsr_15_max;
                        // console.log('brainRegions', JSON.stringify(brainRegions));

                        if (data.length === cnt) {
                            acceleration_data_list.sort(function(b, a) {
                                var keyA = a.date_time,
                                keyB = b.date_time;
                                if (keyA < keyB) return -1;
                                if (keyA > keyB) return 1;
                                return 0;
                            });
                            res.send({
                                message: "success",
                                data: acceleration_data_list,
                                // frontal_Lobe: frontal_Lobe,
                                brainRegions: brainRegions
                            })
                        }

                        cnt++;
                    })
                    .catch(err => {
                        let brainRegions = {};
                        brainRegions['principal-max-strain'] = {};
                        brainRegions['principal-min-strain'] = {};
                        brainRegions['axonal-strain-max'] = {};
                        brainRegions['csdm-max'] = {};
                        brainRegions['masXsr-15-max'] = {};
                        var acceleration_data_list = [];
                        // acceleration_data_list.push({
                        //     sensor_data: ''
                        // })
                        res.send({
                            message: "failure",
                            data: acceleration_data_list,
                            brainRegions: brainRegions,
                            error: err
                        })
                    })
                })
               
            })
            .catch(err => {
                let brainRegions = {};
                brainRegions['principal-max-strain'] = {};
                brainRegions['principal-min-strain'] = {};
                brainRegions['axonal-strain-max'] = {};
                brainRegions['csdm-max'] = {};
                brainRegions['masXsr-15-max'] = {};
                var acceleration_data_list = [];
                // acceleration_data_list.push({
                //     sensor_data: ''
                // })
                res.send({
                    message: "failure",
                    data: acceleration_data_list,
                    brainRegions: brainRegions,
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}getCumulativeEventPressureData`, function (req, res) {
        res.send(getCumulativeEventPressureData());
    })

    app.post(`${apiPrefix}getCumulativeEventLoadData`, function (req, res) {
        res.send(getCumulativeEventLoadData());
    })

    app.post(`${apiPrefix}getHeadAccelerationEvents`, function (req, res) {
        console.log(req.body);
        getHeadAccelerationEvents(req.body)
            .then(data => {
                res.send({
                    message: "success",
                    data: data
                })
            })
            .catch(err => {
                console.log("========================>,ERRROR ,", err);
                res.send({
                    message: "failure",
                    error: err
                });
            })
    })

    app.post(`${apiPrefix}getTeamAdminData`, function (req, res) {
        res.send(getTeamAdminData());
    })

    app.post(`${apiPrefix}getImpactSummary`, function (req, res) {
        res.send(getImpactSummary());
    })

    app.post(`${apiPrefix}getImpactHistory`, function (req, res) {
        res.send(getImpactHistory());
    })

    app.post(`${apiPrefix}getPlayersData`, function (req, res) {
        res.send(getPlayersData());
    })

    app.post(`${apiPrefix}getOrganizationAdminData`, function (req, res) {
        res.send(getOrganizationAdminData());
    })

    app.post(`${apiPrefix}getAllRosters`, function (req, res) {
        res.send(getAllRosters());
    })

    app.post(`${apiPrefix}getUpdatesAndNotifications`, (req, res) => {
        var subject = `${req.body.first_name} ${req.body.last_name} subscribed for updates`;
        ejs.renderFile(__dirname + '/views/UpdateTemplate.ejs', { data: req.body }, {}, function (err, str) {
            if (err) {
                res.send({
                    message: "failure",
                    error: err
                })
            }
            else {
                sendMail(config_env.mail_list, subject, str)
                    .then(response => {
                        //  Send the mail to User who registered for updates...
                        ejs.renderFile(__dirname + '/views/AdminRespondUpdateTemplate.ejs', { data: req.body }, {}, function (err, str) {
                            if (err) {
                                res.send({
                                    message: "failure",
                                    error: err
                                })
                            }
                            else {
                                subject = "NSFCAREER.IO | Thank you for subscribing !";
                                sendMail(req.body.email, subject, str)
                                    .then(response => {
                                        res.send({
                                            message: "success",
                                            data: response
                                        })
                                    })
                                    .catch(err => {
                                        res.send({
                                            message: "failure",
                                            error: err
                                        })
                                    })
                            }
                        })
                    })
                    .catch(err => {
                        res.send({
                            message: "failure",
                            error: err
                        })
                    })
            }
        })
    })

    app.post(`${apiPrefix}addTeam`, function (req, res) {
        addTeam(req.body)
            .then(data => {
                // Adding user to organization
                return new addTeamToOrganizationList(req.body.organization, req.body.team_name)
            })
            .then(d => {
                res.send({
                    message: "success"
                })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}fetchAllTeamsInOrganization`, function (req, res) {

        fetchAllTeamsInOrganization(req.body.organization)
            .then(list => {
                var teamList = list.filter(function (team) {

                    return (!("team_list" in team));
                });
                let counter = 1;
                if (teamList.length == 0) {
                    res.send({
                        message: "success",
                        data: []
                    })
                }
                else {
                    teamList.forEach(function (team, index) {
                        let data = team;
                        let i = index;
                        getTeamData({ team: data.team_name })
                            .then(simulation_records => {
                                counter++;
                                team["simulation_count"] = Number(simulation_records.length).toString();

                                if (counter == teamList.length) {
                                    res.send({
                                        message: "success",
                                        data: teamList
                                    })
                                }
                            })
                            .catch(err => {
                                counter++
                                if (counter == teamList.length) {
                                    res.send({
                                        message: "failure",
                                        error: err
                                    })
                                }
                            })
                    })
                }
            })
            .catch(err => {
                console.log(err);
                res.send({
                    message: "failure",
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}deleteTeam`, function (req, res) {
        deleteTeam(req.body)
            .then(d => {
                return new deleteTeamFromOrganizationList(req.body.organization, req.body.team_name)
            })
            .then(d => {
                res.send({
                    message: "success"
                })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}getAllSensorBrands`, function (req, res) {
        getAllSensorBrands()
            .then(list => {
                var brandList = list.filter(function (brand) {
                    return (!("brandList" in brand));
                });

                let counter = 0;
                if (brandList.length == 0) {
                    res.send({
                        message: "success",
                        data: []
                    })
                } else {

                    brandList.forEach(function (brand, index) {
                        let data = brand;
                        let i = index;
                        getBrandData({ sensor: data.sensor })
                            .then(simulation_records => {
                                
                                brand["simulation_count"] = Number(simulation_records.length).toString();
                                brand["simulation_status"] = '';
                                brand["computed_time"] = '';
                                brand["simulation_timestamp"] = '';

                                simulation_records.forEach(function (simulation_record, index) {
                                    simulation_record['date_time'] = simulation_record.player_id.split('$')[1];
                                })

                                simulation_records.sort(function (b, a) {
                                    var keyA = a.date_time,
                                        keyB = b.date_time;
                                    if (keyA < keyB) return -1;
                                    if (keyA > keyB) return 1;
                                    return 0;
                                });
                                                                
                                if (simulation_records.length > 0) {
                                    getPlayerSimulationStatus(simulation_records[0].image_id)
                                        .then(simulation => {
                                            // console.log('simulaimagimage_ide_idtion', simulation_records[0].image_id );
                                            // console.log('simulation', simulation );
                                            brand["simulation_status"] = simulation ? simulation.status : '';
                                            brand["computed_time"] = simulation ? simulation.computed_time : '';
                                            brand["simulation_timestamp"] = simulation_records[0].player_id.split('$')[1];
                                            counter++;
                                            if (counter == brandList.length) {
                                                res.send({
                                                    message: "success",
                                                    data: brandList
                                                })
                                            }
                                        }).catch(err => {
                                            console.log('err', err);
                                        })
                                } else {
                                    counter++;
                                    if (counter == brandList.length) {
                                        res.send({
                                            message: "success",
                                            data: brandList
                                        })
                                    }
                                }
                            })
                            .catch(err => {
                                counter++
                                if (counter == brandList.length) {
                                    res.send({
                                        message: "failure",
                                        error: err
                                    })
                                }
                            })
                    })
                }
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}getAllOrganizationsOfSensorBrand`, function (req, res) {
        // console.log('getAllOrganizationsOfSensorBrand',req.body)
        getAllOrganizationsOfSensorBrand(req.body)
            .then(list => {
                // console.log(list);
                let uniqueList = [];
                var orgList = list.filter(function (organization) {
                    if (uniqueList.indexOf(organization.organization) === -1) {
                        uniqueList.push(organization.organization);
                        return organization;
                    }
                });

                let counter = 0;
                if (orgList.length == 0) {
                    res.send({
                        message: "success",
                        data: []
                    })
                } else {
                    orgList.forEach(function (org, index) {
                        let data = org;
                        let i = index;
                        getBrandOrganizationData({ sensor: data.sensor, organization: data.organization })
                            .then(simulation_records => {
                                
                                org["simulation_count"] = Number(simulation_records.length).toString();
                                org["simulation_status"] = '';
                                org["computed_time"] = '';
                                org["simulation_timestamp"] = '';

                                simulation_records.forEach(function (simulation_record, index) {
                                    simulation_record['date_time'] = simulation_record.player_id.split('$')[1];
                                })

                                simulation_records.sort(function (b, a) {
                                    var keyA = a.date_time,
                                        keyB = b.date_time;
                                    if (keyA < keyB) return -1;
                                    if (keyA > keyB) return 1;
                                    return 0;
                                });
                                
                                if (simulation_records.length > 0) {
                                    getPlayerSimulationStatus(simulation_records[0].image_id)
                                        .then(simulation => {
                                            org["simulation_status"] = simulation ? simulation.status : '';
                                            org["computed_time"] = simulation ? simulation.computed_time : '';
                                            org["simulation_timestamp"] = simulation_records[0].player_id.split('$')[1];
                                            counter++;
                                            if (counter == orgList.length) {
                                                res.send({
                                                    message: "success",
                                                    data: orgList
                                                })
                                            }
                                        }).catch(err => {
                                            console.log('err',err);
                                        })
                                } else {
                                    counter++;
                                    if (counter == orgList.length) {
                                        res.send({
                                            message: "success",
                                            data: orgList
                                        })
                                    }
                                }
                            })
                            .catch(err => {
                                counter++
                                if (counter == orgList.length) {
                                    res.send({
                                        message: "failure",
                                        error: err
                                    })
                                }
                            })
                    })
                }
            })
    })

    app.post(`${apiPrefix}getAllteamsOfOrganizationOfSensorBrand`, function (req, res) {
        getAllTeamsOfOrganizationsOfSensorBrand(req.body)
            .then(list => {
                // console.log(list);
                // let uniqueList = [];
                // var teamList = list.filter(function (team_name) {
                //     return (!("teamList" in team_name));
                // });
                let uniqueList = [];
                var teamList = list.filter(function (team_name) {
                    if (uniqueList.indexOf(team_name.team_name) === -1) {
                        uniqueList.push(team_name.team_name);
                        return team_name;
                    }
                });
                
                let counter = 0;
                if (teamList.length == 0) {
                    res.send({
                        message: "success",
                        data: []
                    })
                } else {
                    teamList.forEach(function (team, index) {
                        let data = team;
                        let i = index;
                        getOrganizationTeamData({ sensor: data.sensor && req.body.brand ? data.sensor : false, organization: data.organization, team: data.team_name })
                            .then(simulation_records => {
                                
                                team["simulation_count"] = Number(simulation_records.length).toString();
                                team["simulation_status"] = '';
                                team["computed_time"] = '';
                                team["simulation_timestamp"] = '';

                                simulation_records.forEach(function (simulation_record, index) {
                                    simulation_record['date_time'] = simulation_record.player_id.split('$')[1];
                                })

                                simulation_records.sort(function (b, a) {
                                    var keyA = a.date_time,
                                        keyB = b.date_time;
                                    if (keyA < keyB) return -1;
                                    if (keyA > keyB) return 1;
                                    return 0;
                                });
                                
                                if (simulation_records.length > 0) {
                                    getPlayerSimulationStatus(simulation_records[0].image_id)
                                        .then(simulation => {
                                            team["simulation_status"] = simulation ? simulation.status : '';
                                            team["computed_time"] = simulation ? simulation.computed_time : '';
                                            team["simulation_timestamp"] = simulation_records[0].player_id.split('$')[1];
                                            counter++;
                                            if (counter == teamList.length) {
                                                res.send({
                                                    message: "success",
                                                    data: teamList
                                                })
                                            }
                                        }).catch(err => {
                                            console.log('err',err);
                                        })
                                } else {
                                    counter++;
                                    if (counter == teamList.length) {
                                        res.send({
                                            message: "success",
                                            data: teamList
                                        })
                                    }
                                }
                            })
                            .catch(err => {
                                counter++
                                if (counter == teamList.length) {
                                    res.send({
                                        message: "failure",
                                        error: err
                                    })
                                }
                            })
                    })
                }
            })
    })

    // Configuring port for APP
    const port = process.env.PORT || 3000;
    const server = app.listen(port, function () {
        console.log('Magic happens on ' + port);
    });

    // ======================================
    //              FUNCTIONS
    // ======================================



    function sendMail(recepient, subject, body, attachement_name = null, attachment = null) {
        console.log("Mail is being sent to ", recepient, " by ", email);
        return new Promise((resolve, reject) => {

            console.log(email);
            var message = {
                from: email,
                to: recepient,
                subject: subject,
                priority: 'high'
            }
            if (body.includes('html')) {
                message["html"] = body;
            }
            else {
                message["text"] = body;
            }

            if (attachment != null) {
                message["attachments"] = {
                    filename: attachement_name,
                    path: attachment,
                    cid: "IRB"
                }
            }

            transport.sendMail(message, (err, info) => {

                if (err) {
                    reject(err)
                    console.log("error while sending mail", err);
                }
                else {
                    console.log('success while sending mail')
                    resolve({
                        status: "success",
                        log: `Mail sent `
                    })
                }
            })
        })
    }

    function generateJWToken(obj, expiry) {
        return new Promise((resolve, reject) => {
            console.log('Generating jwt secret');
            jwt.sign(obj, config_env.jwt_secret, { expiresIn: expiry }, (err, token) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(token);
                }
            })
        })
    }

    function verifyToken(token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, config_env.jwt_secret, (err, decoded) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    resolve(decoded);
                }
            })
        })
    }

    function uploadSimulationFile(user_id, timestamp, cb) {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`/home/ec2-user/FemTech/build/examples/ex5/${user_id}-${timestamp}.png`, function (err, headBuffer) {
            if (err) {
                cb(err, '');
            }
            else {
                params.Key = user_id + "/profile/simulation/" + timestamp + ".png";
                params.Body = headBuffer;
                // Call S3 Upload
                s3.upload(params, (err, data) => {
                    if (err) {
                        cb(err, '');
                    }
                    else {
                        cb('', data);
                    }
                });

            }
        })
    }

    function generateSimulationFile(user_id) {
        return new Promise((resolve, reject) => {
            // 1. Do Simulation
            // 2. Post Process Simulation
            // 3. Store the file in DynamoDB

            // Doing Simulation on generic brain.inp file
            var cmd = `cd /home/ec2-user/FemTech/build/examples/ex5;mpirun --allow-run-as-root -np 16  --mca btl_base_warn_component_unused 0  -mca btl_vader_single_copy_mechanism none ex5 input.json`
            console.log(cmd);
            executeShellCommands(cmd).then((data) => {

                // Doing Post Processing on simulation
                var timestamp = Date.now();

                cmd = `cd /home/ec2-user/FemTech/build/examples/ex5; ~/MergePolyData/build/MultipleViewPorts brain3.ply Br_color3.jpg output.json ${user_id}-${timestamp}.png cellcentres.txt`;
                console.log(cmd);
                executeShellCommands(cmd).then((data) => {
                    uploadSimulationFile(user_id, timestamp, (err, data) => {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            resolve(data);
                        }
                    })

                })
                    .catch((error) => {
                        console.log(err);
                        reject(error);
                    })
            }).catch((error) => {
                console.log(err);
                reject(error);
            })
        })
    }





    function getCumulativeEventPressureData() {
        var myObject = {
            message: "success",
            data: {
                pressure: [241, 292, 125, 106, 282, 171, 58, 37, 219, 263],
                time_label: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45],
                timestamp: Number(Date.now()).toString()
            }
        }
        return myObject;
    }

    function getCumulativeEventLoadData() {
        var myObject = {
            message: "success",
            data: {
                load: [{ dataset: [198, 69, 109, 139, 73] }
                    , { dataset: [28, 113, 31, 10, 148] }
                    , { dataset: [28, 2, 1, 10, 148] }
                    , { dataset: [182, 3, 16, 97, 240] }
                ],

                time_label: ["W1", "W2", "W3", "W4", "W5"],
                timestamp: Number(Date.now()).toString()
            }
        }
        return myObject;
    }

    function getHeadAccelerationEvents(obj) {
        return new Promise((resolve, reject) => {
            let params = {
                TableName: 'sensor_data',
                KeyConditionExpression: "team = :team and begins_with(player_id, :player_id)",
                ExpressionAttributeValues: {
                    ":team": obj.team,
                    ":player_id": obj.player_id
                }
            };
            var item = [];
            docClient.query(params).eachPage((err, data, done) => {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                if (data == null) {
                    let records = concatArrays(item);
                    let date = records.map(function (record) {
                        return record.date;
                    });
                    // Now we will store no of impacts corresponding to date
                    var date_map = new Map();
                    for (var i = 0; i < date.length; i++) {
                        // check if key in map exists (Player id)
                        // if it doesn't exists then add the array element
                        // else update value of alert and impacts in existsing key in map
                        if (date_map.has(date[i])) {

                            let tempObject = date_map.get(date[i]);
                            tempObject += 1;
                            date_map.set(date[i], tempObject);
                        }
                        else {

                            date_map.set(date[i], 0);
                        }
                    }
                    console.log("DATE MAP", date_map.keys());
                    console.log(Array.from(date_map.values()));
                    resolve({
                        no_of_impacts: Array.from(date_map.values()),
                        dates: Array.from(date_map.keys()),
                        timestamp: Number(Date.now()).toString()
                    });
                } else {
                    item.push(data.Items);
                }
                done();
            });
        })
        // var myObject = {
        //     message : "success",
        //     data : {
        //         pressure : [176, 267, 187, 201, 180, 4, 230, 258, 14, 21, 89, 23, 119, 113, 28, 49],
        //         time_label : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75],
        //         timestamp : Number(Date.now()).toString()
        //     }
        // }
        // return myObject;
    }

    function getTeamAdminData() {
        var myObject = {
            message: "success",
            data: {
                organization: "York tech Football",
                sports_type: "football",
                roster_count: 3,
                impacts: 4,
                avg_load: 6,
                alerts: 8,
                highest_load: 0.046,
                most_impacts: 7
            }
        }
        return myObject;
    }

    function getImpactSummary() {
        var myObject =
        {
            message: "success",
            data: {
                pressure: [0, 0, 0.1, 0.5, 0.2],
                force: ["20-29g", "30-39g", "40-49g", "50-59g", "60-69g"]
            }
        }
        return myObject;
    }

    function getImpactHistory() {
        var myObject =
        {
            message: "success",
            data: {
                pressure: [0.2, 0.5, 1.0, 0.5, 0.2, 0.5, 0.1],
                force: ["20-29g", "30-39g", "40-49g", "50-59g", "60-69g", "70-79g", "80-89g"]
            }
        }
        return myObject;
    }

    function getPlayersData() {
        var myObject = {
            message: "success",
            data: [
                {
                    player_name: "Player 1",
                    sport: "Football",
                    position: "RB",
                    alerts: 2,
                    impacts: 4,
                    load: 0.34
                },
                {
                    player_name: "Player 1",
                    sport: "Football",
                    position: "RB",
                    alerts: 2,
                    impacts: 4,
                    load: 0.32
                },
                {
                    player_name: "Player 2",
                    sport: "Football",
                    position: "FA",
                    alerts: 2,
                    impacts: 8,
                    load: 0.31
                }
            ]
        }
        return myObject;
    }

    function getOrganizationAdminData() {
        var myObject = {
            message: "success",
            data: {
                organization: "York tech Football",
                sports_type: "football",
                roster_count: 3,
                impacts: 4,
                avg_load: 6,
                alerts: 8,
                highest_load: 0.046,
                most_impacts: 7
            }
        }
        return myObject;
    }

    function getAllRosters() {

        var myObject = {
            message: "success",
            data: {
                rosters: ["Roster 1", "Roster 2", "Roster 3", "Roster 4"]
            }
        }
        return myObject;
    }

    function customInsertionSortForGraphData(arr, arr1) {
        // arr needs to be the Y-AXIS of the graph
        // arr1 is X-AXIS of the graph
        for (var i = 1; i < arr.length; i++) {
            if (arr[i] < arr[0]) {
                //move current element to the first position
                arr.unshift(arr.splice(i, 1)[0]);
                arr1.unshift(arr1.splice(i, 1)[0]);

            }
            else if (arr[i] > arr[i - 1]) {
                //leave current element where it is
                continue;
            }
            else {
                //find where element should go
                for (var j = 1; j < i; j++) {
                    if (arr[i] > arr[j - 1] && arr[i] < arr[j]) {
                        //move element
                        arr.splice(j, 0, arr.splice(i, 1)[0]);
                        arr1.splice(j, 0, arr1.splice(i, 1)[0]);
                    }
                }
            }
        }
        return {
            array_Y: arr,
            array_X: arr1
        }
    }

    function getPlayersInList(list) {
        var playerMap = new Map();
        for (var i = 0; i < list.length; i++) {
            // check if key in map exists (Player id)
            // if it doesn't exists then add the array element
            // else update value of alert and impacts in existsing key in map
            if (playerMap.has(list[i].player_id)) {

                let tempObject = playerMap.get(list[i].player_id);
                tempObject.impact += list[i].impact;
                playerMap.set(list[i].player_id, tempObject);
            }
            else {

                playerMap.set(list[i].player_id, list[i]);
            }
        }
        console.log(playerMap.keys());
        return Array.from(playerMap.values());

    }

    function indexOfMax(arr) {
        if (arr.length === 0) {
            return -1;
        }

        var max = arr[0];
        var maxIndex = 0;

        for (var i = 1; i < arr.length; i++) {
            if (arr[i] > max) {
                maxIndex = i;
                max = arr[i];
            }
        }

        return maxIndex;
    }
    function writeJsonToFile(path, jsonObject) {

        return new Promise((resolve, reject) => {
            fs.writeFile(path, JSON.stringify(jsonObject), (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        })
    }
    function uploadPlayerSimulationFile(user_id, file_path, file_name, date, image_id = null) {

        return new Promise((resolve, reject) => {
            var uploadParams = {
                Bucket: config.usersbucket,
                Key: '', // pass key
                Body: null, // pass file body
            };

            const params = uploadParams;

            fs.readFile(file_path, function (err, headBuffer) {
                if (err) {
                    console.log("ERROR in Reading", err);
                    reject(err);
                }
                else {
                    updateSimulationImageToDDB(image_id, config.usersbucket, user_id + `/simulation/${date}/` + file_name)
                        .then(value => {

                            params.Key = user_id + `/simulation/${date}/` + file_name;
                            params.Body = headBuffer;
                            // Call S3 Upload
                            s3.upload(params, (err, data) => {
                                if (err) {
                                    console.log("ERROR IN S3", err);
                                    reject(err);
                                }
                                else {
                                    // TODO -> Write the buffer to Image BASE64 & Update it in DB
                                    resolve(data)
                                }
                            });
                        })
                        .catch(err => {
                            console.log("Error in reading", err);
                            reject(data);
                        })
                }
            })
        })
    }

    function uploadIRBForm(user_id, file_path, file_name) {

        return new Promise((resolve, reject) => {
            var uploadParams = {
                Bucket: config.usersbucket,
                Key: '', // pass key
                Body: null, // pass file body
            };

            const params = uploadParams;

            fs.readFile(file_path, function (err, headBuffer) {
                if (err) {
                    reject(err);
                }
                else {
                    params.Key = user_id + `/irb/` + file_name;
                    params.Body = headBuffer;
                    // Call S3 Upload
                    s3.upload(params, (err, data) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve(data);
                        }
                    });

                }
            })
        })
    }

    function base64_encode(file) {
        // read binary data
        let bitmap = fs.readFileSync(file);

        // convert binary data to base64 encoded string
        return new Buffer(bitmap).toString('base64');
    }

    function getFileFromS3(url, bucket_name) {
        // console.log('url', url)
        return new Promise((resolve, reject) => {
            var params = {
                Bucket: bucket_name ? bucket_name : config_env.usersbucket,
                Key: url
            };
            s3.getObject(params, function (err, data) {
                if (err) {
                    // reject(err)
                    resolve(null);
                }
                else {
                    resolve(data);
                }
            });
        })
    }

    function getImageFromS3Buffer(image_data) {
        return new Promise((resolve, reject) => {
            try {
                resolve(image_data.Body.toString('base64'))
            }
            catch (e) {
                // reject(e)
                resolve(null);
            }
        })
    }
}
