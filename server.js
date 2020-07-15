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
        getPlayerSimulationFile
    } = require('./controller/query');

    // Clearing the cookies
    app.get(`/`, (req, res) => {
        res.send("TesT SERVICE HERE");
    })

    app.post(`${apiPrefix}generateSimulationForSensorData`, setConnectionTimeout('10m'), function (req, res) {
        // console.log('user_cognito_id', req.body.user_cognito_id);
        let apiMode = req.body.mode;
        let sensor =  req.body.sensor !== undefined ? req.body.sensor : null;
        let reader = 0;
        let filename = req.body.data_filename !== undefined ? req.body.data_filename : null;

        if (sensor === 'sensor_company_x' || sensor === 'SWA' ) {
            reader = 1;
            filename = req.body.data_filename
        }
        
        if (sensor === 'prevent') {
            reader = 2;
            filename = req.body.data_filename
        }

        // The file content will be in 'upload_file' parameter
        let buffer = Buffer.from(req.body.upload_file, 'base64');

        let file_extension = null;
        if (filename !== null) {
            file_extension = filename.split(".");
            file_extension = file_extension[file_extension.length - 1];
        }
        
        if (file_extension === 'json') { // Reading json from file 
            const new_items_array = JSON.parse(buffer);
            //console.log(new_items_array);
            const sensor_data_array = [];

            // Adding image id in array data
            for (var i = 0; i < new_items_array.length; i++) {
                var _temp = new_items_array[i];
                // _temp["user_cognito_id"] = req.body.user_cognito_id;
                // _temp["image_id"] = shortid.generate();
                // _temp["player_id"] = _temp["player_id"] + '$' + Date.now();
                // _temp["simulation_status"] = 'pending';
                // _temp["team"] = _temp.player.team;
              
                // if (_temp["sensor"] === 'prevent') {
                //     _temp['mesh-transformation'] = [ "-y", "z", "-x" ];
                // }

                // if (_temp["sensor"] === 'sensor_company_x') {
                //     _temp['mesh-transformation'] = ["-z", "x", "-y" ];
                // }

                //  if (_temp["sensor"] === 'sisu') {
                //     _temp['mesh-transformation'] = ["-z", "-x", "-y"];
                // }

                // new_items_array[i] = _temp;

                var _temp_sensor_data = {};
                _temp_sensor_data["sensor"] = _temp["sensor"];
                _temp_sensor_data["impact-date"] = _temp["impact-date"];
                _temp_sensor_data["impact-time"] = _temp["impact-time"];
                _temp_sensor_data["organization"] = _temp["organization"];
                _temp_sensor_data["player"] = _temp["player"];

                _temp_sensor_data["simulation"] = {
                    "la-units" : "",
                    "linear-acceleration" : {},
                    "angular-acceleration" : {}
                };

                _temp_sensor_data["simulation"]["linear-acceleration"] = {};

                if (_temp["simulation"]['time-units'] === 'seconds') {
                    _temp["simulation"]['time'].forEach((time, i) => {
                        var _temp_time = parseFloat(time) * 0.001;
                        _temp["simulation"]['time'][i] = _temp_time;
                    })
                }

                let x_g = [];
                let y_g = [];
                let z_g = [];

                if (_temp["simulation"]['linear-acceleration']['la-units'] === 'g') {
                    _temp["simulation"]['linear-acceleration']['x-la'].forEach((la, x) => {
                        var _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['x-la'][x] = _temp_la;
                        x_g.push(_temp_la);
                    })

                    _temp["simulation"]['linear-acceleration']['y-la'].forEach((la, y) => {
                        var _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['y-la'][y] = _temp_la;
                        y_g.push(_temp_la);
                    })

                    _temp["simulation"]['linear-acceleration']['z-la'].forEach((la, z) => {
                        var _temp_la = parseFloat(la) * 9.80665;
                        _temp["simulation"]['linear-acceleration']['z-la'][z] = _temp_la;
                        z_g.push(_temp_la);
                    })
                } else {
                    _temp["simulation"]['linear-acceleration']['x-la'].forEach((la, x) => {
                        var _temp_la = parseFloat(la) / 9.80665;
                        x_g.push(_temp_la);
                    })
                    
                    _temp["simulation"]['linear-acceleration']['y-la'].forEach((la, y) => {
                        var _temp_la = parseFloat(la) / 9.80665;
                        y_g.push(_temp_la);
                    })
                    
                    _temp["simulation"]['linear-acceleration']['z-la'].forEach((la, z) => {
                        var _temp_la = parseFloat(la) / 9.80665;
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
                    _temp_sensor_data['mesh-transformation'] = [ "-y", "z", "-x"];
                    _temp_sensor_data['maximum-time'] = 49.6875;
                } else if (req.body.sensor_brand === 'Sensor Company X' || req.body.sensor_brand === 'SWA') {
                    _temp_sensor_data['mesh-transformation'] = ["-z", "x", "-y"];
                    _temp_sensor_data['angular-to-linear-frame'] = ["-y", "-x", "z"];
                    _temp_sensor_data['maximum-time'] = 49.6875;
                } else if (req.body.sensor_brand === 'SISU') {
                    _temp_sensor_data['mesh-transformation'] = ["-z", "-x", "y"];
                    _temp_sensor_data['time-peak-acceleration'] = 0.2;
                    _temp_sensor_data['maximum-time'] = 0.4;
                } else {
                    _temp_sensor_data['mesh-transformation'] = [ "-y", "z", "-x"];
                    _temp_sensor_data['maximum-time'] = 49.6875; 
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
                            addPlayerToTeamOfOrganization(req.body.user_cognito_id, temp.organization, temp.team, temp.player_id)
                                .then(d => {
                                    counter++;
                                    if (counter == result.length) {
                                        // Upload player selfie if not present and generate meshes
                                        // Generate simulation for player
                                        uploadPlayerSelfieIfNotPresent(req.body.selfie, temp.player_id, req.body.filename)
                                            .then((selfieDetails) => {
                                                return generateSimulationForPlayersFromJson(sensor_data_array, apiMode);
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
                    // Adding default organization PSU to the impact data

                    items.map((element) => {
                        return element.organization = "PSU";
                    });

                    const new_items_array = _.map(items, o => _.extend({ organization: "PSU" }, o));

                    // Adding image id in array data
                    for (var i = 0; i < new_items_array.length; i++) {
                        var _temp = new_items_array[i];
                        _temp["user_cognito_id"] = req.body.user_cognito_id;
                        _temp["image_id"] = shortid.generate();
                        _temp['player'] = {};
                        _temp['player']['first-name'] = "Unknown";
                        _temp['player']['last-name'] = "Unknown";
                        _temp['player']['sport'] = "Unknown";
                        _temp['player']['position'] = "Unknown";
                        if (reader == 1) {
                            _temp["team"] = config_env.queue_x;
                        }
                        _temp['player']['team'] = _temp.team;
                        new_items_array[i] = _temp;

                    }
                    console.log('New items array is ', new_items_array);

                    // Stores sensor data in db 
                    // TableName: "sensor_data"
                    // team, player_id

                    storeSensorData(new_items_array)
                        .then(flag => {

                            var players = items.map(function (player) {
                                return {
                                    player_id: player.player_id.split("$")[0],
                                    team: (reader == 1) ? config_env.queue_x : player.team,
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
                                    addPlayerToTeamOfOrganization(req.body.user_cognito_id, temp.organization, temp.team, temp.player_id)
                                        .then(d => {
                                            counter++;
                                            if (counter == result.length) {
                                                // Upload player selfie if not present and generate meshes
                                                // Generate simulation for player
                                                uploadPlayerSelfieIfNotPresent(req.body.selfie, temp.player_id, req.body.filename)
                                                    .then((selfieDetails) => {
                                                        return generateSimulationForPlayers(new_items_array, reader, apiMode, sensor);
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
                    message: failure,
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
                    data: data[0]
                })
            })
            .catch(err => {
                res.send({
                    message: "failure",
                    data: {},
                    error: err
                })
            })
    })

    app.post(`${apiPrefix}getPlayersDetails`, function (req, res) {

        getPlayersListFromTeamsDB(req.body)
            .then(data => {
                console.log(data[0].player_list);
                let player_list = data[0].player_list;
                if (player_list.length == 0) {
                    res.send({
                        message: "success",
                        data: []
                    })
                }
                else {
                    var counter = 0;
                    var p_data = [];
                    player_list.forEach(function (player, index) {
                        let p = player;
                        let i = index;
                        let playerData = '';
                        let imageData = '';
                        getTeamDataWithPlayerRecords({ player_id: p, team: req.body.team_name, user_cognito_id: req.body.user_cognito_id, organization: req.body.organization })
                            .then(player_data => {
                               playerData = player_data;
                               return getPlayerSimulationFile(player_data[0]);
                            })
                            .then(image_data => {
                                imageData = image_data;
                                if (image_data.path && image_data.path != 'null')
                                    return getFileFromS3(image_data.path);
                            })
                            .then(image_s3 => {
                                if (imageData.path && imageData.path != 'null')
                                    return getImageFromS3Buffer(image_s3);
                            })     
                            .then(image => {
                                counter++;
                                p_data.push({
                                    player_name: p,
                                    simulation_image: image ? image : '',
                                    simulation_data: playerData
                                });

                                if (counter == player_list.length) {
                                    res.send({
                                        message: "success",
                                        data: p_data
                                    })
                                }
                            })
                            // .catch(err => {
                            //     console.log(err);
                            //     counter++;
                            //     if (counter == player_list.length) {
                            //         res.send({
                            //             message: "failure",
                            //             data: p_data
                            //         })
                            //     }
                            // })
                    })
                }
            })
            .catch(err => {
                console.log(err);
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

    app.post(`${apiPrefix}getAllCumulativeAccelerationTimeRecords`, function (req, res) {

        getCumulativeAccelerationData(req.body)
            .then(data => {
                var acceleration_data_list = [];
                var frontal_Lobe = [];
                let cnt = 1;
                data.forEach(function (acc_data) {
                    let accData = acc_data;
                    let imageData = '';
                    let outputFile = '';
                    getPlayerSimulationFile(acc_data)
                    .then(image_data => {
                        imageData = image_data;
                        if (imageData.ouput_file_path && imageData.ouput_file_path != 'null') {
                            let file_path = image_data.ouput_file_path;
                            file_path = file_path.replace(/'/g, "");
                            return getFileFromS3(file_path);
                        }
                    })
                   .then(output_file => {
                        outputFile = output_file;
                        if (imageData.path && imageData.path != 'null')
                            return getFileFromS3(imageData.path);
                    })
                    .then(image_s3 => {
                        if (imageData.path && imageData.path != 'null')
                            return getImageFromS3Buffer(image_s3);
                    })
                    .then(image => {
                        console.log(accData);
                        // X- Axis Linear Acceleration
                        let linear_acceleration = accData.sensor ? accData.simulation['linear-acceleration'] : accData['linear-acceleration'];
                        // X- Axis Angular Acceleration
                        let angular_acceleration = accData.sensor ? accData.simulation['angular-acceleration'] : accData['angular-acceleration'];
                        // Y Axis timestamp
                        let time = accData.sensor ? accData.simulation['linear-acceleration']['xt'] : accData['linear-acceleration']['xt'];
                        console.log(time);
                        time.forEach((t, i) => {
                            var _temp_time = parseFloat(t).toFixed(1);
                            time[i] = _temp_time;
                        })

                        acceleration_data_list.push({
                            linear_acceleration: linear_acceleration,
                            angular_acceleration: angular_acceleration,
                            time: time,
                            simulation_image: image ? image : '',
                            //simulation_output_data: outputFile ? JSON.parse(outputFile.Body.toString('utf-8')) : '',
                            timestamp: accData.date,
                            record_time: accData.time,
                            sensor_data: accData
                        })

                        if (outputFile) {
                            outputFile = JSON.parse(outputFile.Body.toString('utf-8'));
                            let coordinate = {};
                            coordinate.x = outputFile['principal-max-strain'] ? outputFile['principal-max-strain'].location[0] : ''
                            coordinate.y = outputFile['principal-max-strain'] ? outputFile['principal-max-strain'].location[1] : ''
                            coordinate.z = outputFile['principal-max-strain'] ? outputFile['principal-max-strain'].location[2] : ''
                            frontal_Lobe.push(coordinate);
                        }

                        if (data.length === cnt) {
                            res.send({
                                message: "success",
                                data: acceleration_data_list,
                                frontal_Lobe: frontal_Lobe
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

                res.send({
                    message: "failure",
                    data: acceleration_data_list,
                    frontal_Lobe: [],
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
                    // console.log(data.user_cognito_id);
                    getBrandData({ user_cognito_id: data.user_cognito_id })
                        .then(simulation_records => {
                            counter++;
                            brand["simulation_count"] = Number(simulation_records.length).toString();

                            if (counter == brandList.length) {
                                res.send({
                                    message: "success",
                                    data: brandList
                                })
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
                    getBrandOrganizationData({ user_cognito_id: data.user_cognito_id, organization: data.organization })
                        .then(simulation_records => {
                            counter++;
                            org["simulation_count"] = Number(simulation_records.length).toString();

                            if (counter == orgList.length) {
                                res.send({
                                    message: "success",
                                    data: orgList
                                })
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
    })

    app.post(`${apiPrefix}getAllteamsOfOrganizationOfSensorBrand`, function (req, res) {
        getAllTeamsOfOrganizationsOfSensorBrand(req.body)
        .then(list => {
            // console.log(list);
            let uniqueList = [];
            var teamList = list.filter(function (team_name) {
                return (!("teamList" in team_name));
            });

            console.log(teamList);

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
                    getOrganizationTeamData({ user_cognito_id: data.user_cognito_id, organization: data.organization, team: data.team_name})
                        .then(simulation_records => {
                            counter++;
                            team["simulation_count"] = Number(simulation_records.length).toString();

                            if (counter == teamList.length) {
                                console.log(teamList);
                                res.send({
                                    message: "success",
                                    data: teamList
                                })
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

    function getFileFromS3(url){
        return new Promise((resolve, reject) =>{
            var params = {
                Bucket: config_env.usersbucket,
                Key: url
            };
            s3.getObject(params, function(err, data) {
                if (err) {
                    reject(err)
                }
                else{
                    resolve(data);
                }
            });
        })
    }

    function getImageFromS3Buffer(image_data){
        return new Promise((resolve, reject) => {
            console.log(image_data.Body);
                try{
                    resolve(image_data.Body.toString('base64'))
                }
                catch (e){
                    reject(e)
                }
    
        })
    }

}
