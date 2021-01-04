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
        moment = require('moment'),
        async = require("async");

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
        generateINP,
        deleteSimulationFromBucket
    } = require('./controller/simulation');

    const {
        getUserDetails,
        getUserDetailBySensorId,
        getUserByPlayerId,
        updateSimulationFileStatusInDB,
        getTeamDataWithPlayerRecords,
        getTeamData,
        getPlayersListFromTeamsDB,
        getCompletedJobs,
        updateJobComputedTime,
        getJobs,
        updateJobLogStreamName,
        getPlayerSimulationFile,
        removeRequestedPlayerFromOrganizationTeam,
        addPlayer,
        getUserDetailByPlayerId,
        checkSensorDataExists,
        getOrganizationData,
        getUsersWthNoAccountId
    } = require('./controller/query');

    app.get(`/`, (req, res) => {
        res.send("TesT SERVICE HERE");
    })

    // Update users whic have no account id
    app.get('/updateUsers', (req, res) => { 
        getUsersWthNoAccountId()
            .then (data => {
                console.log(data.length);
                // data.forEach((user) => {
                //     let account_id = Math.floor(Math.random() * 9000000000) + 1000000000;
                //     account_id = account_id.toString();
                //     var userParams = {
                //         TableName: "users",
                //         Key: {
                //             user_cognito_id: user.user_cognito_id,
                //         },
                //         UpdateExpression:
                //             "set account_id = :account_id",
                //         ExpressionAttributeValues: {
                //             ":account_id": account_id,
                //         },
                //         ReturnValues: "UPDATED_NEW",
                //     };
                //     docClient.update(userParams, (err, data) => {
                //         if (err) {
                //             console.log('Error ', err);
                //         } else{
                //             console.log('User updated.');
                //         }
                //     });
                // })
            });
    })

    // Creating copy of s3 folder 
    app.get(`/copyS3Folder`, (req, res) => {
        // res.send("TesT SERVICE HERE");
        var bucketName = config_env.usersbucket;
        var s3 = new AWS.S3({params: {Bucket: bucketName}});
        var oldPrefix = 'd050c279-9b85-49f2-99f5-e3bafa7aaabd/';
        var newPrefix = '4857219589/';

        var done = function(err, data) {
            if (err) console.log(err);
            else console.log(data);
          };
          
          s3.listObjects({Prefix: oldPrefix}, function(err, data) {
            if (data.Contents.length) {
              async.each(data.Contents, function(file, cb) {
                var params = {
                  Bucket: bucketName,
                  CopySource: bucketName + '/' + file.Key,
                  Key: file.Key.replace(oldPrefix, newPrefix)
                };
                s3.copyObject(params, function(copyErr, copyData){
                  if (copyErr) {
                    console.log(copyErr);
                  }
                  else {
                    console.log('Copied: ', params.Key);
                    cb();
                  }
                });
              }, done);
            }
          });
    })

    app.get(`/deleteTestData`, (req, res) => {
        const obj = {};
        obj.brand = 'Prevent Biometrics';
        obj.organization = 'Army Research Laboratory';
        obj.team = '2020 POMPOC Study';

        getTeamData(obj)
            .then (data => {
                console.log(data.length);
                data.forEach((player) => {
                    let params = {
                        TableName: "sensor_details",
                        Key: {
                            team: player.team,
                            player_id: player.player_id,
                        },
                    };
                    docClient.delete(params, function (err, data) {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log('Deleted from sensor_details');
                            let params1 = {
                                TableName: "simulation_images",
                                Key: {
                                    image_id: player.image_id,
                                },
                            };
                            docClient.delete(params1, function (err, data) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    console.log('Deleted from simulation_images');
                                }
                            });
                        }
                    });
                })
            });
    })

    app.get(`/updateData`, (req, res) => {
        const obj = {};
        obj.brand = 'Prevent Biometrics';
        obj.organization = 'Army Research Laboratory';
        obj.team = '2020 POMPOC Study';

        getTeamData(obj)
            .then (data => {
                console.log(data.length);
                data.forEach((player) => {
                    getUserDetailByPlayerId(player.player_id.split('$')[0] + '-' + player.sensor)
                        .then (u_detail => {
                            if (u_detail.length > 0 && u_detail[0].account_id) {
                                var userParams = {
                                    TableName: "simulation_images",
                                    Key: {
                                        image_id: player.image_id,
                                    },
                                    UpdateExpression:
                                        "set account_id = :account_id",
                                    ExpressionAttributeValues: {
                                        ":account_id": u_detail[0].account_id,
                                    },
                                    ReturnValues: "UPDATED_NEW",
                                };
                                docClient.update(userParams, (err, data) => {
                                    if (err) {
                                        console.log('Error ', err);
                                    } else{
                                        console.log('Player detail updated.');
                                    }
                                });
                            }
                        })
                })
            });
    })

    app.get('/migrateData', (req, res) => {
        const obj = {};
        // obj.brand = 'Prevent Biometrics';
        obj.organization = 'Army Research Laboratory';
        obj.team = 'Ryan Niece H3 Study';
        getTeamData(obj)
            .then (data => {
                console.log(data.length);
                data.forEach((player) => {
                    const player_obj = {};
                    player_obj.organization = player.organization;
                    player_obj.team_name = player.team;
                    player_obj.sensor = player.sensor;
                    console.log(player_obj);
                    if (player.sensor) {
                        getOrganizationData(player_obj)
                            .then (org => {
                                if (org.length > 0) {
                                    player.org_id = org[0].organization_id;
                                    const dbInsert = {
                                        TableName: "sensor_details",
                                        Item: player,
                                    };
                                    docClient.put(dbInsert, function (err, data) {
                                        if (err) {
                                            console.log(err);
                                            // reject(err);
                                        } else {
                                            //.resolve(data);
                                            console.log('Record added.');
                                        }
                                    });
                                } else {
                                    console.log('Organization ', player.image_id);
                                }
                            })
                    } else {
                        console.log('Sensor ', player.image_id);
                    }
                })
            })
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
        let overwrite = req.body.overwrite !== undefined ? req.body.overwrite : false;
        let bypass_simulation_formatting = req.body.bypass_simulation_formatting !== undefined ? req.body.bypass_simulation_formatting : false;

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
            let new_items_array = [];
            try {
                new_items_array = file_extension === 'json' ? JSON.parse(buffer) : JSON.parse(req.body.json);
            } catch (e) {
                res.send({
                    message: "failure",
                    error: 'Provided JSON format is not valid. Please check it.'
                })
            }

            if (new_items_array.length == 0) {
                res.send({
                    message: "failure",
                    error: 'JSON data is required.'
                })
            } else {
                checkSensorDataExists({'impact-id' : new_items_array[0]["player"]["impact-id"] ? new_items_array[0]["player"]["impact-id"] : '', 'sensor-id' : new_items_array[0]["player"]["sensor-id"] ? new_items_array[0]["player"]["sensor-id"] : ''})
                    .then(sensor_detail => {
                    console.log('sensor_detail ', sensor_detail);
                    if (sensor_detail.length > 0 && !overwrite) {
                        res.send({
                            message: "failure",
                            error: "Duplicate event simulation skipped, use -F \"overwrite=true\" to recompute"
                        })
                    } else {
                        // console.log(new_items_array);
                        const sensor_data_array = [];

                        ( async () => {
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

                                let x_g = [];
                                let y_g = [];
                                let z_g = [];

                                if (bypass_simulation_formatting) {

                                    _temp["player_id"] = _temp["uid"];
                                    _temp_sensor_data["simulation"] = _temp["simulation"];

                                    _temp["simulation"]['linear-acceleration']['xv'].forEach((la, x) => {
                                        const _temp_la = parseFloat(la) / 9.80665;
                                        x_g.push(_temp_la);
                                    })

                                    _temp["simulation"]['linear-acceleration']['yv'].forEach((la, y) => {
                                        const _temp_la = parseFloat(la) / 9.80665;
                                        y_g.push(_temp_la);
                                    })

                                    _temp["simulation"]['linear-acceleration']['zv'].forEach((la, z) => {
                                        const _temp_la = parseFloat(la) / 9.80665;
                                        z_g.push(_temp_la);
                                    })

                                   if (_temp["simulation"]['time-all']) {
                                        _temp_sensor_data["simulation"]["linear-acceleration"]['xt'] = _temp["simulation"]['time-all'];
                                        _temp_sensor_data["simulation"]["linear-acceleration"]['yt'] = _temp["simulation"]['time-all'];
                                        _temp_sensor_data["simulation"]["linear-acceleration"]['zt'] = _temp["simulation"]['time-all'];
                                        _temp_sensor_data["simulation"]["angular-acceleration"]['xt'] = _temp["simulation"]['time-all'];
                                        _temp_sensor_data["simulation"]["angular-acceleration"]['yt'] = _temp["simulation"]['time-all'];
                                        _temp_sensor_data["simulation"]["angular-acceleration"]['zt'] = _temp["simulation"]['time-all'];
                                    }

                                    _temp_sensor_data["simulation"]["linear-acceleration"]['xv-g'] = x_g;
                                    _temp_sensor_data["simulation"]["linear-acceleration"]['yv-g'] = y_g;
                                    _temp_sensor_data["simulation"]["linear-acceleration"]['zv-g'] = z_g;
                                   
                                } else {
                                    if (_temp["simulation"]['time-units'] === 'seconds') {
                                        _temp["simulation"]['time'].forEach((time, i) => {
                                            const _temp_time = parseFloat(time) * 1000;
                                            _temp["simulation"]['time'][i] = _temp_time;
                                        })
                                    }
    
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
                                }

                                _temp_sensor_data["user_cognito_id"] = req.body.user_cognito_id;
                                //_temp_sensor_data["image_id"] = bypass_simulation_formatting ? _temp.uid : shortid.generate();
                                // _temp_sensor_data["image_id"] = shortid.generate();
                               
                                if (sensor_detail.length > 0) {
                                    _temp_sensor_data["image_id"] = sensor_detail[0].image_id;
                                    getPlayerSimulationFile({image_id : sensor_detail[0].image_id})
                                        .then(simulation => {
                                            if (simulation) {
                                                deleteSimulationFromBucket(simulation, function (err, data) {
                                                    console.log('Deleted from bucket');
                                                })  
                                            }
                                        })
                                    let params = {
                                        TableName: "sensor_details",
                                        Key: {
                                            org_id: sensor_detail[0].org_id,
                                            player_id: sensor_detail[0].player_id,
                                        },
                                    };
                                    docClient.delete(params, function (err, data) {
                                        if (err) {
                                            console.log(err);
                                        } else {
                                            console.log('Player deleted from sensor_details');
                                            let params1 = {
                                                TableName: "simulation_images",
                                                Key: {
                                                    image_id: sensor_detail[0].image_id,
                                                },
                                            };
                                            docClient.delete(params1, function (err, data) {
                                                if (err) {
                                                    console.log(err);
                                                } else {
                                                    console.log('Player deleted from simulation_images');
                                                }
                                            });
                                        }
                                    });    
                                } else {
                                    _temp_sensor_data["image_id"] = shortid.generate();
                                }

                                _temp_sensor_data["player_id"] = _temp["player_id"] + '$' + Date.now();
                                _temp_sensor_data["simulation_status"] = 'pending';
                                _temp_sensor_data["team"] = _temp.player.team;

                                if (req.body.sensor_brand === 'Prevent') {
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["-y", "z", "-x"];
                                } else if (req.body.sensor_brand === 'Sensor Company X' || req.body.sensor_brand === 'SWA') {
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["-z", "x", "-y"];
                                    _temp_sensor_data["simulation"]['angular-to-linear-frame'] = ["-y", "-x", "z"];
                                } else if (req.body.sensor_brand === 'SISU') {
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["-z", "-x", "y"];
                                } else if (req.body.sensor_brand === 'Stanford') {
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["y", "-z", "-x"];
                                }  else if (req.body.sensor_brand === 'Hybrid3') {
                                // _temp_sensor_data["simulation"]['mesh-transformation'] = ["z", "-x", "-y"];
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["-y", "z", "-x"];
                                } else {
                                    _temp_sensor_data["simulation"]['mesh-transformation'] = ["-y", "z", "-x"];
                                }

                                if (bypass_simulation_formatting) {
                                    _temp_sensor_data['uid'] = _temp["uid"];
                                    // _temp_sensor_data["simulation"]['mesh-transformation'] = _temp["simulation"]["mesh-transformation"];
                                    // _temp_sensor_data["simulation"]['mesh'] = _temp["simulation"]["mesh"];
                                    // _temp_sensor_data["simulation"]['maximum-time'] = _temp["simulation"]["maximum-time"];
                                    // _temp_sensor_data["simulation"]['head-cg'] = _temp["simulation"]["head-cg"];
                                }

                                if (_temp_sensor_data['impact-id'] && _temp_sensor_data['sensor-id']) {
                                    delete _temp_sensor_data['impact-id'];
                                    delete _temp_sensor_data['sensor-id'];
                                }

                                await getUserDetailBySensorId(req.body.sensor_brand, _temp.player_id.split("$")[0])
                                    .then (user_detail => {
                                        // console.log(user_detail);
                                        if (user_detail.length > 0) {
                                            _temp_sensor_data['player']['first-name'] = user_detail[0]['first_name'];
                                            _temp_sensor_data['player']['last-name'] = user_detail[0]['last_name'];
                                            sensor_data_array.push(_temp_sensor_data);
                                            removeRequestedPlayerFromOrganizationTeam(_temp["player"]["organization"] ? _temp["player"]["organization"] : _temp["organization"], _temp["player"]["team"], user_detail[0]['user_cognito_id'])
                                                .then(data => {
                                                    // console.log(data);
                                                })
                                        } else {
                                            sensor_data_array.push(_temp_sensor_data);
                                        }
                                    })
                                    .catch(err => {
                                        sensor_data_array.push(_temp_sensor_data);
                                    })
                            }
                            console.log('new_items_array is ', (sensor_data_array));

                            // Stores sensor data in db 
                            // TableName: "sensor_details"
                            // team, player_id

                            // storeSensorData(sensor_data_array)
                            //     .then(flag => {

                                    if (level === 300) {
                                        for (var i = 0; i < sensor_data_array.length; i++) {
                                            let _temp1 = sensor_data_array[i];
                                            _temp1.sensor = req.body.sensor_brand
                                            sensor_data_array[i] = _temp1;
                                        }
                                    }

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
                                                .then(org_id => {
                                                    console.log('org ', org_id);
                                                    if (counter === 0) {
                                                        storeSensorData(sensor_data_array, org_id)
                                                            .then(flag => {
                                                                // 
                                                            })
                                                    }
                                                    counter++;
                                                    if (counter == result.length) {
                                                        // Upload player selfie if not present and generate meshes
                                                        // Generate simulation for player

                                                        // Generate 10 digits unique number
                                                        let account_id = Math.floor(Math.random() * 9000000000) + 1000000000;
                                                        account_id = account_id.toString();
                                                        let player_id = temp.player_id + '-' + temp.sensor;
                                                        // getUserByPlayerId(player_id)
                                                        getUserDetailBySensorId(temp.sensor, temp.player['sensor-id'])
                                                            .then (user_detail => {
                                                                // console.log(user_detail);
                                                                if (user_detail.length > 0) {
                                                                    if (user_detail[0]['account_id']) {
                                                                        account_id = user_detail[0]['account_id'];
                                                                    }
                                                                    if (user_detail[0]['player_id']) {
                                                                        player_id = user_detail[0]['player_id'];
                                                                    }
                                                                    var userParams = {
                                                                        TableName: "users",
                                                                        Key: {
                                                                            "user_cognito_id": user_detail[0]['user_cognito_id'],
                                                                        },
                                                                        UpdateExpression: "set account_id = :account_id, player_id = :player_id",
                                                                        ExpressionAttributeValues: {
                                                                            ":account_id": account_id,
                                                                            ":player_id": player_id
                                                                        },
                                                                        ReturnValues: "UPDATED_NEW"
                                                                    };
                                                                    docClient.update(userParams, (err, data) => {
                                                                        if (err) {
                                                                            console.log(err);
                                                                        }
                                                                    })
                                                                } else {
                                                                    let obj = {};
                                                                    obj['user_cognito_id'] = player_id;
                                                                    obj['account_id'] = account_id;
                                                                    obj['sensor_id_number'] = temp.player['sensor-id'] ? temp.player['sensor-id'] : '';
                                                                    obj['player_id'] = player_id;
                                                                    obj['sensor'] = temp.sensor;
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
                                                                        return generateSimulationForPlayersFromJson(sensor_data_array, apiMode, mesh, account_id, bypass_simulation_formatting);
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
                                // })
                                // .catch(err => {
                                //     console.log(err);
                                //     res.send({
                                //         message: "failure",
                                //         error: err
                                //     })
                                // })
                        })();
                    }
                })
            }
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

                        if (new_items_array.length == 0) {
                            res.send({
                                message: "failure",
                                error: 'CSV data is required.'
                            })
                        } else {

                            checkSensorDataExists({'impact-id' : new_items_array[0]["impact-id"] ? new_items_array[0]["impact-id"] : '', 'sensor-id' : new_items_array[0]["sensor-id"] ? new_items_array[0]["sensor-id"] : ''})
                                .then(sensor_detail => {
                                console.log('sensor_detail ', sensor_detail);
                                if (sensor_detail.length > 0 && !overwrite) {
                                    res.send({
                                        message: "failure",
                                        error: 'Duplicate event simulation skipped, use -F "overwrite=true" to recompute'
                                    })
                                } else {
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

                                            if (sensor_detail.length > 0) {
                                                _temp["image_id"] = sensor_detail[0].image_id;

                                                getPlayerSimulationFile({image_id : sensor_detail[0].image_id})
                                                    .then(simulation => {
                                                        if (simulation) {
                                                            deleteSimulationFromBucket(simulation, function (err, data) {
                                                                console.log('Deleted from bucket');
                                                            })
                                                        }
                                                    })
                                                let params = {
                                                    TableName: "sensor_details",
                                                    Key: {
                                                        org_id: sensor_detail[0].org_id,
                                                        player_id: sensor_detail[0].player_id,
                                                    },
                                                };
                                                docClient.delete(params, function (err, data) {
                                                    if (err) {
                                                        console.log(err);
                                                    } else {
                                                        console.log('Player deleted from sensor_details');
                                                        let params1 = {
                                                            TableName: "simulation_images",
                                                            Key: {
                                                                image_id: sensor_detail[0].image_id,
                                                            },
                                                        };
                                                        docClient.delete(params1, function (err, data) {
                                                            if (err) {
                                                                console.log(err);
                                                            } else {
                                                                console.log('Player deleted from simulation_images');
                                                            }
                                                        });
                                                    }
                                                });    
                                            } else {
                                                _temp["user_cognito_id"] = req.body.user_cognito_id;
                                            }
            
                                            _temp["level"] = level;
                                            _temp["user_cognito_id"] = req.body.user_cognito_id;
                                            _temp["sensor"] = req.body.sensor_brand;
                                           // _temp["image_id"] = shortid.generate();
                                            _temp['player'] = {};
                                            _temp['player']['first-name'] = "Unknown";
                                            _temp['player']['last-name'] = "Unknown";
                                            _temp['player']['sport'] = "Unknown";
                                            _temp['player']['position'] = "Unknown";
                                            _temp['player']['team'] = "Unknown";
                                            _temp['player']['impact-id'] = _temp['impact-id'] ? _temp['impact-id'] : 'Unknown';
                                            _temp['player']['sensor-id'] = _temp['sensor-id'] ? _temp['sensor-id'] : 'Unknown';
                                            _temp["team"] = "Unknown";
            
                                            if (_temp['impact-id'] && _temp['sensor-id']) {
                                                delete _temp['impact-id'];
                                                delete _temp['sensor-id'];
                                            }
                                            
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
                                                    } else {
                                                        new_items_array[i] = _temp;
                                                    }
                                                })
                                                .catch(err => {
                                                    new_items_array[i] = _temp;
                                                })
                                        }
            
                                        console.log('New items array is ', new_items_array);
            
                                        // Stores sensor data in db 
                                        // TableName: "sensor_details"
                                        // team, player_id
            
                                        // storeSensorData(new_items_array)
                                        //     .then(flag => {
            
                                                if (level === 300) {
                                                    for (var i = 0; i < new_items_array.length; i++) {
                                                        let _temp1 = new_items_array[i];
                                                        _temp1.sensor = req.body.sensor_brand
                                                        new_items_array[i] = _temp1;
                                                    }
                                                }
            
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
                                                            .then(org_id => {
                                                                console.log('org ', org_id);
                                                                if (counter === 0) {
                                                                    storeSensorData(new_items_array, org_id)
                                                                        .then(flag => {
                                                                            // 
                                                                        })
                                                                }
                                                                counter++;
                                                                if (counter == result.length) {
                                                                    // Upload player selfie if not present and generate meshes
                                                                    // Generate simulation for player
            
                                                                    // Generate 10 digits unique number
                                                                    let account_id = Math.floor(Math.random() * 9000000000) + 1000000000;
                                                                    account_id = account_id.toString();
                                                                    let player_id = temp.player_id + '-' + temp.sensor;
                                                                    // getUserByPlayerId(player_id)
                                                                    getUserDetailBySensorId(temp.sensor, temp.player['sensor-id'])
                                                                        .then (user_detail => {
                                                                            // console.log(user_detail);
                                                                            if (user_detail.length > 0) {
                                                                                if (user_detail[0]['account_id']) {
                                                                                    account_id = user_detail[0]['account_id'];
                                                                                }    
                                                                                if (user_detail[0]['player_id']) {
                                                                                    player_id = user_detail[0]['player_id'];
                                                                                }
                                                                                var userParams = {
                                                                                    TableName: "users",
                                                                                    Key: {
                                                                                        "user_cognito_id": user_detail[0]['user_cognito_id'],
                                                                                    },
                                                                                    UpdateExpression: "set account_id = :account_id, player_id = :player_id",
                                                                                    ExpressionAttributeValues: {
                                                                                        ":account_id": account_id,
                                                                                        ":player_id": player_id
                                                                                    },
                                                                                    ReturnValues: "UPDATED_NEW"
                                                                                };
                                                                                docClient.update(userParams, (err, data) => {
                                                                                    if (err) {
                                                                                        console.log(err);
                                                                                    }
                                                                                })
                                                                            } else {
                                                                                let obj = {};
                                                                                obj['user_cognito_id'] = player_id;
                                                                                obj['account_id'] = account_id;
                                                                                obj['sensor_id_number'] = temp.player['sensor-id'] ? temp.player['sensor-id'] : '';
                                                                                obj['sensor'] = temp.sensor;
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
                                            // })
                                    })();
                                }
                            });    
                        }
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
    cron.schedule('*/2 * * * *', () => {
        getCompletedJobs()
            .then(simulation_data => {
                if (simulation_data.length > 0) {
                    simulation_data.forEach((job) => {
                        if (job.job_id !== undefined) {
                            var params = {
                                jobs: [job.job_id]
                            };
                            batch.describeJobs(params, function (err, data) {
                                if (err) {
                                    console.log(err, err.stack);
                                } else {
                                    // console.log(data);
                                    if (data.jobs.length > 0) {
                                        if (data.jobs[0].status === 'SUCCEEDED') {
                                            data = data.jobs[0];
                                            const computed_time = (data.stoppedAt - data.startedAt) // miliseconds
                                            const log_stream_name = data.container.logStreamName;
                                            let obj = {};
                                            obj.image_id = job.image_id;
                                            obj.computed_time = computed_time;
                                            obj.log_stream_name = log_stream_name;

                                            updateJobComputedTime(obj, function (err, dbdata) {
                                                if (err) {
                                                    console.log(err);
                                                }
                                                else {
                                                    console.log('Computed tine and Log stream added in database for job id: ' +  data.jobId);
                                                }
                                            })
                                        }
                                    }
                                }
                            })
                        }
                    })
                } else {
                    // console.log('No job found');
                }
            })
            .catch(err => {
                console.log(err);
            })
    });

    // Cron to get job log stream name after job completion
    cron.schedule('*/2 * * * *', () => {
        getJobs()
            .then(simulation_data => {
                if (simulation_data.length > 0) {
                    // console.log('Jobs ' , simulation_data.length);
                    simulation_data.forEach((job) => {
                        if (job.job_id !== undefined) {
                            var params = {
                                jobs: [job.job_id]
                            };
                            batch.describeJobs(params, function (err, data) {
                                if (err) {
                                    console.log(err, err.stack);
                                } else {
                                    // console.log(data);
                                    if (data.jobs.length > 0) {
                                        if (data.jobs[0].status === 'SUCCEEDED' || data.jobs[0].status === 'FAILED') {
                                            const log_stream_name = data.jobs[0].container.logStreamName;
                                            let obj = {};
                                            obj.image_id = job.image_id;
                                            obj.log_stream_name = log_stream_name;

                                            updateJobLogStreamName(obj, function (err, dbdata) {
                                                if (err) {
                                                    console.log(err);
                                                }
                                                else {
                                                    console.log('Log stream added in database for job id: ' + data.jobs[0].jobId);
                                                }
                                            })
                                        }
                                    }
                                }
                            })
                        }
                    })
                }
            })
            .catch(err => {
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
                // console.log('player_list', player_list);
                // console.log('requested_player_list', requested_player_list);
                // let player_list = data[0].player_list ? data[0].player_list : [];
                if (player_list.length == 0) {
                    let requested_players = []
                    if (requested_player_list.length > 0) {
                        let p_cnt = 0;
                        requested_player_list.forEach(function (p_record) {
                            console.log('p_record',p_record)
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

                                                getUserDetailByPlayerId(record.simulation_data[0].player_id.split('$')[0]+'-'+record.simulation_data[0]['sensor'])
                                                    .then (u_detail => {
                                                        p_data[index]['simulation_data'][0]['user_data'] = u_detail.length > 0 ? u_detail[0] : '';
                                                        k++;
                                                        if (k == p_data.length) {
                                                            let requested_players = []
                                                            if (requested_player_list.length > 0) {
                                                                let p_cnt = 0;
                                                                requested_player_list.forEach(function (p_record) {
                                                                    console.log('p_record--------------------\n',p_record)
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

    //pending
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


    function getHeadAccelerationEvents(obj) {
        return new Promise((resolve, reject) => {
            let params = {
                TableName: 'sensor_details',
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
