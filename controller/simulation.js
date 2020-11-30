const AWS = require('aws-sdk'),
    fs = require("fs"),
    { spawn } = require('child_process'),
    download = require('download-file'),
    execFile = require('child_process').execFile,
    XLSX = require('xlsx'),
    jwt = require('jsonwebtoken'),
    shortid = require('shortid'),
    archiver = require('archiver'),
    moment = require('moment');

    shortid.characters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$');

const {
    storeSensorData,
    addPlayerToTeamOfOrganization,
    checkIfSelfiePresent,
    updateSelfieAndModelStatusInDB,
    updateSimulationImageToDDB,
    updateSimulationData,
    fetchCGValues,
    uploadCGValuesAndSetINPStatus
} = require('./query');

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

// var config = require('../config/configuration_keys.json'); 
var config_env = config;
const BUCKET_NAME = config_env.usersbucket;

var s3 = new AWS.S3();
var batch = new AWS.Batch();
const csvparser = require("csvtojson");
const rootPath = '/home/ec2-user';

function convertFileDataToJson(buf, reader, filename) {
    return new Promise((resolve, reject) => {
        if (reader == 1 || reader == 2) {
            convertCSVDataToJSON(buf, reader, filename)
                .then(data => {
                    resolve(data);
                })
                .catch(err => {
                    console.log('ERROR IS ', JSON.stringify(err));
                    reject(err);
                })
        } else {
            convertXLSXDataToJSON(buf, function (items) {
                resolve(items);
            })
        }
    })
}

function convertCSVDataToJSON(buf, reader, filename) {
    return new Promise((resolve, reject) => {
        csvparser()
            .fromString(buf.toString())
            .then(data => {
                if (reader == 1) {
                    resolve(groupSensorData(data));
                } else {
                    resolve(groupSensorDataForY(data, filename));
                }
            })
            .catch(err => {
                console.log('err is ', err);
                reject(err);
            })
    })
}

function convertXLSXDataToJSON(buf, cb) {
    // Generic data format
    var wb = XLSX.read(buf, { type: 'buffer' });
    var sheet_name_list = wb.SheetNames;
    sheet_name_list.forEach(function (y) {
        var worksheet = wb.Sheets[y];
        var headers = {};
        var data = [];
        for (z in worksheet) {
            if (z[0] === '!') continue;
            //parse out the column, row, and value
            var col = z.substring(0, 1);
            var row = parseInt(z.substring(1));
            var value = worksheet[z].v;

            //store header names
            if (row == 1) {
                if (value == "Athlete") {
                    value = "player_id"
                }
                headers[col] = value
                    .split(" ")
                    .join("_")
                    .replace(/[{()}]/g, '')
                    .toLowerCase();
                continue;
            }

            if (!data[row]) data[row] = {};

            data[row][headers[col]] = value;

        }
        //drop those first two rows which are empty
        data.shift();
        data.shift();
        var data_array = data.filter(function (el) {
            return el.false_positive == false;
        });

        for (var i = 0; i < data_array.length; i++) {
            var d = data_array[i];
            // TODO : Parse Date here
            data_array[i]["timestamp"] = Number(parseDate(d.date, d.time, d.time_zone)).toString();
            data_array[i]["simulation_status"] = "pending";
            data_array[i].player_id = data_array[i].player_id + "$" + data_array[i].timestamp;
        }
        cb(data_array);
    });
}

function groupSensorDataForY(arr, filename) {

    let time = filename.split("-").slice(2, 5).join("-").split("T")[1].split('.')[0];
    time = time.replace(' ', '+');
    time = time.split('+')[0].match(/.{1,2}/g).join(":") + ':' + time.split('+')[1];
    let data = {
        'player_id': filename.split("-")[0].split("MG")[1] + '$' + Date.now(),
        'date': filename.split("-").slice(2, 5).join("-").split("T")[0],
        'time': time,
        'impact-id': filename.split("-")[1],
        'sensor-id': filename.split("-")[0].split("MG")[1],
        'team': config_env.queue_y,
        'linear-acceleration': {
            'xt': [],
            'xv': [],
            'xv-g': [],
            'yt': [],
            'yv': [],
            'yv-g': [],
            'zt': [],
            'zv': [],
            'zv-g': []
        },
        'angular-acceleration': {
            'xt': [],
            'xv': [],
            'yt': [],
            'yv': [],
            'zt': [],
            'zv': []
        },
        'angular-velocity': {
            'xt': [],
            'xv': [],
            'yt': [],
            'yv': [],
            'zt': [],
            'zv': []
        },
        'mesh-transformation': ["-y", "z", "-x"],
        'simulation_status': 'pending'

    }
    let max_time = parseFloat(arr[0]["t"]["ms"]);
    for (let i = 0; i < arr.length; i++) {
        let curr_time = parseFloat(arr[i]["t"]["ms"]);
        if (curr_time > max_time)
            max_time = curr_time;

        arr[i]["PLA"]['X']['msec^2'] = arr[i]["PLA"]['X']['msec^2'] && arr[i]["PLA"]['X']['msec^2'] != '' ? arr[i]["PLA"]['X']['msec^2'] : 0
        arr[i]["PLA"]['Y']['msec^2'] = arr[i]["PLA"]['Y']['msec^2'] && arr[i]["PLA"]['Y']['msec^2'] != '' ? arr[i]["PLA"]['Y']['msec^2'] : 0
        arr[i]["PLA"]['Z']['msec^2'] = arr[i]["PLA"]['Z']['msec^2'] && arr[i]["PLA"]['Z']['msec^2'] != '' ? arr[i]["PLA"]['Z']['msec^2'] : 0

        arr[i]['PAV']['X']['radsec'] = arr[i]['PAV']['X']['radsec'] && arr[i]['PAV']['X']['radsec'] != '' ? arr[i]['PAV']['X']['radsec'] : 0
        arr[i]['PAV']['Y']['radsec'] = arr[i]['PAV']['Y']['radsec'] && arr[i]['PAV']['Y']['radsec'] != '' ? arr[i]['PAV']['Y']['radsec'] : 0
        arr[i]['PAV']['Z']['radsec'] = arr[i]['PAV']['Z']['radsec'] && arr[i]['PAV']['Z']['radsec'] != '' ? arr[i]['PAV']['Z']['radsec'] : 0

        arr[i]['PAA']['X']['radsec^2'] = arr[i]['PAA']['X']['radsec^2'] && arr[i]['PAA']['X']['radsec^2'] != '' ? arr[i]['PAA']['X']['radsec^2'] : 0
        arr[i]['PAA']['Y']['radsec^2'] = arr[i]['PAA']['Y']['radsec^2'] && arr[i]['PAA']['Y']['radsec^2'] != '' ? arr[i]['PAA']['Y']['radsec^2'] : 0
        arr[i]['PAA']['Z']['radsec^2'] = arr[i]['PAA']['Z']['radsec^2'] && arr[i]['PAA']['Z']['radsec^2'] != '' ? arr[i]['PAA']['Z']['radsec^2'] : 0

        data['linear-acceleration']['xv'].push(parseFloat(arr[i]["PLA"]['X']['msec^2']))
        data['linear-acceleration']['xv-g'].push(parseFloat(arr[i]["PLA"]['X']['msec^2']) / 9.80665)
        data['linear-acceleration']['xt'].push(curr_time)
        data['linear-acceleration']['yv'].push(parseFloat(arr[i]['PLA']['Y']['msec^2']))
        data['linear-acceleration']['yv-g'].push(parseFloat(arr[i]["PLA"]['Y']['msec^2']) / 9.80665)
        data['linear-acceleration']['yt'].push(curr_time)
        data['linear-acceleration']['zv'].push(parseFloat(arr[i]['PLA']['Z']['msec^2']))
        data['linear-acceleration']['zv-g'].push(parseFloat(arr[i]["PLA"]['Z']['msec^2']) / 9.80665)
        data['linear-acceleration']['zt'].push(curr_time)

        data['angular-velocity']['xv'].push(parseFloat(arr[i]['PAV']['X']['radsec']))
        data['angular-velocity']['xt'].push(curr_time)
        data['angular-velocity']['yv'].push(parseFloat(arr[i]['PAV']['Y']['radsec']))
        data['angular-velocity']['yt'].push(curr_time)
        data['angular-velocity']['zv'].push(parseFloat(arr[i]['PAV']['Z']['radsec']))
        data['angular-velocity']['zt'].push(curr_time)

        data['angular-acceleration']['xv'].push(parseFloat(arr[i]['PAA']['X']['radsec^2']))
        data['angular-acceleration']['xt'].push(curr_time)
        data['angular-acceleration']['yv'].push(parseFloat(arr[i]['PAA']['Y']['radsec^2']))
        data['angular-acceleration']['yt'].push(curr_time)
        data['angular-acceleration']['zv'].push(parseFloat(arr[i]['PAA']['Z']['radsec^2']))
        data['angular-acceleration']['zt'].push(curr_time)

    }
    // Add max_time in simulation ( in seconds )
    data.max_time = max_time / 1000;

    return [data];
}

function groupSensorData(arr) {
    var helper = {};

    var result = arr.reduce(function (accumulator, data_point) {

        var key = data_point['Session ID'] + '$' + data_point['Player ID'] + '$' + data_point['Date'];

        data_point['Sample Num'] = data_point['Sample Num'] && data_point['Sample Num'] != '' ? data_point['Sample Num'] : 0
        data_point['Linear Acc x g'] = data_point['Linear Acc x g'] && data_point['Linear Acc x g'] != '' ? data_point['Linear Acc x g'] : 0
        data_point['Linear Acc y g'] = data_point['Linear Acc y g'] && data_point['Linear Acc y g'] != '' ? data_point['Linear Acc y g'] : 0
        data_point['Linear Acc z g'] = data_point['Linear Acc z g'] && data_point['Linear Acc z g'] != '' ? data_point['Linear Acc z g'] : 0

        data_point['Angular Acc x rad/s2'] = data_point['Angular Acc x rad/s2'] && data_point['Angular Acc x rad/s2'] != '' ? data_point['Angular Acc x rad/s2'] : 0
        data_point['Angular Acc y rad/s2'] = data_point['Angular Acc y rad/s2'] && data_point['Angular Acc y rad/s2'] != '' ? data_point['Angular Acc y rad/s2'] : 0
        data_point['Angular Acc z rad/s2'] = data_point['Angular Acc z rad/s2'] && data_point['Angular Acc z rad/s2'] != '' ? data_point['Angular Acc z rad/s2'] : 0
        
        data_point['Angular Vel x rad/s'] = data_point['Angular Vel x rad/s'] && data_point['Angular Vel x rad/s'] != '' ? data_point['Angular Vel x rad/s'] : 0
        data_point['Angular Vel y rad/s'] = data_point['Angular Vel y rad/s'] && data_point['Angular Vel y rad/s'] != '' ? data_point['Angular Vel y rad/s'] : 0
        data_point['Angular Vel z rad/s'] = data_point['Angular Vel z rad/s'] && data_point['Angular Vel z rad/s'] != '' ? data_point['Angular Vel z rad/s'] : 0

        data_point['Linear Acc Mag g'] = data_point['Linear Acc Mag g'] && data_point['Linear Acc Mag g'] != '' ? data_point['Linear Acc Mag g'] : 0
        data_point['Angular Vel Mag rad/s'] = data_point['Angular Vel Mag rad/s'] && data_point['Angular Vel Mag rad/s'] != '' ? data_point['Angular Vel Mag rad/s'] : 0
        data_point['Angular Acc Mag rad/s2'] = data_point['Angular Acc Mag rad/s2'] && data_point['Angular Acc Mag rad/s2'] != '' ? data_point['Angular Acc Mag rad/s2'] : 0

        if (!helper[key]) {
            helper[key] = {
                'date': data_point['Date'] && data_point['Date'] != '' ? data_point['Date'] : '2020-01-01',
                'time': data_point['Time'],
                'session_id': data_point['Session ID'],
                'player_id': data_point['Player ID'] + '$' + Date.now(),
                'sensor-id': data_point['Sensor ID'],
                'impact-id': data_point['Impact ID'],
                'linear-acceleration': {
                    'xt': [parseFloat(data_point['Sample Num'])],
                    'xv': [parseFloat(data_point['Linear Acc x g'])],
                    'xv-g': [parseFloat(data_point['Linear Acc x g']) / 9.80665],
                    'yt': [parseFloat(data_point['Sample Num'])],
                    'yv': [parseFloat(data_point['Linear Acc y g'])],
                    'yv-g': [parseFloat(data_point['Linear Acc y g']) / 9.80665],
                    'zt': [parseFloat(data_point['Sample Num'])],
                    'zv': [parseFloat(data_point['Linear Acc z g'])],
                    'zv-g': [parseFloat(data_point['Linear Acc z g']) / 9.80665]
                },
                'angular-acceleration': {
                    'xt': [parseFloat(data_point['Sample Num'])],
                    'xv': [parseFloat(data_point['Angular Acc x rad/s2'])],
                    'yt': [parseFloat(data_point['Sample Num'])],
                    'yv': [parseFloat(data_point['Angular Acc y rad/s2'])],
                    'zt': [parseFloat(data_point['Sample Num'])],
                    'zv': [parseFloat(data_point['Angular Acc z rad/s2'])]
                },
                'angular-velocity': {
                    'xt': [parseFloat(data_point['Sample Num'])],
                    'xv': [parseFloat(data_point['Angular Vel x rad/s'])],
                    'yt': [parseFloat(data_point['Sample Num'])],
                    'yv': [parseFloat(data_point['Angular Vel y rad/s'])],
                    'zt': [parseFloat(data_point['Sample Num'])],
                    'zv': [parseFloat(data_point['Angular Vel z rad/s'])]
                },
                'linear-acceleration-mag': [parseFloat(data_point['Linear Acc Mag g'])],
                'angular-velocity-mag': [parseFloat(data_point['Angular Vel Mag rad/s'])],
                'angular-acceleration-mag': [parseFloat(data_point['Angular Acc Mag rad/s2'])],
                'mesh-transformation': ["-z", "x", "-y"],
                'simulation_status': 'pending'
            }
            // create a copy of data_point
            accumulator.push(helper[key]);
        } else {
            // Concat acceleration data

            helper[key]['linear-acceleration']['xv'].push(parseFloat(data_point['Linear Acc x g']))
            helper[key]['linear-acceleration']['xv-g'].push(parseFloat(data_point['Linear Acc x g']) / 9.80665)
            helper[key]['linear-acceleration']['xt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['linear-acceleration']['yv'].push(parseFloat(data_point['Linear Acc y g']))
            helper[key]['linear-acceleration']['yv-g'].push(parseFloat(data_point['Linear Acc y g']) / 9.80665)
            helper[key]['linear-acceleration']['yt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['linear-acceleration']['zv'].push(parseFloat(data_point['Linear Acc z g']))
            helper[key]['linear-acceleration']['zv-g'].push(parseFloat(data_point['Linear Acc z g']) / 9.80665)
            helper[key]['linear-acceleration']['zt'].push(parseFloat(data_point['Sample Num']))

            helper[key]['linear-acceleration-mag'].push(parseFloat(data_point['Linear Acc Mag g']))

            helper[key]['angular-velocity']['xv'].push(parseFloat(data_point['Angular Vel x rad/s']))
            helper[key]['angular-velocity']['xt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-velocity']['yv'].push(parseFloat(data_point['Angular Vel y rad/s']))
            helper[key]['angular-velocity']['yt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-velocity']['zv'].push(parseFloat(data_point['Angular Vel z rad/s']))
            helper[key]['angular-velocity']['zt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-velocity-mag'].push(parseFloat(data_point['Angular Vel Mag rad/s']))

            helper[key]['angular-acceleration']['xv'].push(parseFloat(data_point['Angular Acc x rad/s2']))
            helper[key]['angular-acceleration']['xt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-acceleration']['yv'].push(parseFloat(data_point['Angular Acc y rad/s2']))
            helper[key]['angular-acceleration']['yt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-acceleration']['zv'].push(parseFloat(data_point['Angular Acc z rad/s2']))
            helper[key]['angular-acceleration']['zt'].push(parseFloat(data_point['Sample Num']))
            helper[key]['angular-acceleration-mag'].push(parseFloat(data_point['Angular Acc Mag rad/s2']))
        }

        return accumulator;
    }, []);

    return result;
}

function uploadPlayerSelfieIfNotPresent(selfie, player_id, filename, account_id) {
    return new Promise((resolve, reject) => {
        // If no selfie details present then resolve
        if (!selfie) {
            resolve('No selfie in request');
        } else {
            // Check if selfie model is present
            checkIfSelfiePresent(player_id.replace(/ /g, "-"))
                .then(data => {
                    if (data) {
                        // If selfie present data = true
                        resolve(data)
                    } else {
                        // upload selfie and generate meshes
                        uploadPlayerImage(selfie, account_id, filename)
                            .then((imageDetails) => {
                                return getSignedUrl(imageDetails.Key)
                            })
                            .then((url) => {
                                // Get signed url for the image
                                return computeImageData({ body: { image_url: url, user_cognito_id: account_id } });
                            })
                            .then((details) => {
                                resolve(details);
                            })
                            .catch((err) => {
                                console.log(err);
                                reject(err);
                            })
                    }
                })
                .catch(err => {
                    console.log(err);
                    reject(err);
                })
        }
    })
}

function uploadPlayerImage(selfie, player_id, filename) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: BUCKET_NAME,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;
        // player_id = player_id.replace(/ /g, "-");
        console.log('player_id ', player_id)
        var file_extension = filename.split(".");
        file_extension = file_extension[file_extension.length - 1];

        let file_name = Date.now();

        params.Key = `${player_id}/profile/image/${file_name}.${file_extension}`;
        params.Body = Buffer.from(selfie, 'base64');
        // Call S3 Upload
        s3.upload(params, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });

    });
}

function getSignedUrl(key) {
    return new Promise((resolve, reject) => {
        s3.getSignedUrl('getObject', { Bucket: BUCKET_NAME, Key: key }, function (err, url) {
            if (err) {
                reject(err);
            } else {
                resolve(url);
            }
        });
    });
}

function computeImageData(req) {
    // Input { image_url : '', user_cognito_id : ''}
    return new Promise((resolve, reject) => {
        // Get URL Image in input
        // Get User cognito ID in input
        // 1. Generate 3d Avatar
        // 1.1 Set update in DB that selfie model is uploaded
        // 2. Genearte 3d Profile Image from PLY file of 3D Avatar
        // 2.1 Set Update in DB that 3d Profile Png image generated is uploaded
        // - Generate STL file from PLY File -> output -> timestamp.stl | Call pvpython extract.py
        // - Generate Parameters file from PLY File -> output -> timestamp.stl | Call pvpython controlpoints.py
        // 3. Generate INP File
        // - Generate the VTK
        // - Generate Morphed VTK file | call python3  RBF_coarse.py
        // 3.1 Set update in DB that inp file is uploaded
        // 4. Do simulation & generate PNG file of it
        // 4.1 Set Update in DB that simulation file is generated
        // Adding timestamp as filename to request
        req.body["file_name"] = Number(Date.now()).toString();
        generate3DModel(req.body)
            .then(data => {
                return upload3DModelZip(req.body);
            })
            .then(data => {
                // Create Selfie PNG Image using ProjectedTexture VTK
                return executeShellCommands(`xvfb-run ${rootPath}/MergePolyData/build/ImageCapture ./avatars/${req.body.user_cognito_id}/head/model.ply ./avatars/${req.body.user_cognito_id}/head/model.jpg ./avatars/${req.body.user_cognito_id}/head/${req.body.file_name}.png`);
            })
            .then((data) => {
                console.log('Selfie PNG Image ', data);
                // Upload the selfie image generated on S3
                return uploadGeneratedSelfieImage(req.body);
            })
            .then(d => {
                return updateSelfieAndModelStatusInDB(req.body);
            })
            .then(data => {
                return generateStlFromPly(req.body);
            })
            .then(d => {
                return generateParametersFileFromStl(req.body)
            })
            .then(d => {
                // Generate INP File
                return generateINP(req.body.user_cognito_id, req.body);
            })
            .then(data => {
                // Function to clean up
                // the files generated
                return cleanUp(req.body);
            })
            .then(d => {
                resolve({ message: "success" });
            })
            .catch((err) => {
                console.log(err);
                reject(err);
            })
    })

}

function uploadMorphedVTKZip(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: `${user_id}/profile/morphed_vtk/combined_meshes/${timestamp}.zip`, // pass key
            Body: null,
        };
        fs.readFile(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}.zip`, function (err, headBuffer) {
            if (err) {
                console.log(err);
                reject(err);
            }
            else {
                uploadParams.Body = headBuffer;
                s3.upload(uploadParams, (err, data) => {
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

function uploadStlZip(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: `${user_id}/profile/avatar/${timestamp}.zip`, // pass key
            Body: null,
        };
        fs.readFile(`${rootPath}/users_data/${user_id}/stl/${timestamp}.zip`, function (err, headBuffer) {
            if (err) {
                console.log(err);
                reject(err);
            }
            else {
                uploadParams.Body = headBuffer;
                s3.upload(uploadParams, (err, data) => {
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

function createMorphedVTKZip(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        try {
            //archive zip
            var output = fs.createWriteStream(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}.zip`);
            var archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            output.on("close", async function () {
                console.log(archive.pointer() + " total bytes");
                console.log(
                    "archiver has been finalized and the output file descriptor has closed."
                );
                console.log("zip file uploading");
                resolve(true);
            });
            archive.on("error", function (err) {
                console.log('error for zip ', err)
                reject(err);
            });
            archive.pipe(output);

            // append files from a glob pattern
            archive.glob(`*_rotated.vtk`, { cwd: `${rootPath}/users_data/${user_id}/morphed_vtk` });

            archive.finalize();

        } catch (error) {
            console.log(error);
            reject(error);
        }
    })
}

function createStlZip(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        try {
            //archive zip
            var output = fs.createWriteStream(`${rootPath}/users_data/${user_id}/stl/${timestamp}.zip`);
            var archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            output.on("close", async function () {
                console.log(archive.pointer() + " total bytes");
                console.log(
                    "archiver has been finalized and the output file descriptor has closed."
                );
                console.log("zip file uploading");
                resolve(true);
            });
            archive.on("error", function (err) {
                console.log('error for zip ', err)
                reject(err);
            });
            archive.pipe(output);

            // append files from a glob pattern
            archive.glob(`${timestamp}_*`, { cwd: `${rootPath}/users_data/${user_id}/stl` });

            archive.finalize();

        } catch (error) {
            console.log(error);
            reject(error);
        }
    })
}

function generateINP(user_id, obj = null) {
    return new Promise((resolve, reject) => {
        // 1. Get Uploaded model list from user
        // 2. Generate SignedURL of the image
        // 3. Pass the signedURL to download the zip file
        // 4. Generate the INF File
        // 5. Store the INF File in /radio_basis_function/inf file
        getUploadedModelFileList(user_id, (err, list) => {
            if (err) {
                reject(err);
            }
            else {
                // Fetches the latest Model
                var latestModel = list.reduce(function (oldest, latest_model) {
                    return oldest.LastModified > latest_model.LastModified ? oldest : latest_model;
                }, {});

                // Getting the model key
                var model_key;
                if (list.length != 0) {
                    model_key = latestModel.Key;
                }
                else {
                    model_key = user_id + "/profile/model/" + user_id;
                }
                // Generate SignedURL of the image
                getFileSignedUrl(model_key, (err, url) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        // Download file
                        var timestamp = Date.now();
                        var zipFileName = timestamp + ".zip";
                        var options = {
                            directory: `${rootPath}/users_data/${user_id}/model/`,
                            filename: zipFileName
                        }
                        download(url, options, function (err) {
                            if (err) {
                                reject(err);
                            }
                            else {
                                generateMorphedVTK(obj)
                                    .then((d) => {
                                        var cmd = `mkdir -p ${rootPath}/users_data/${user_id}/rbf/ ;  ${rootPath}/MergePolyData/build/InpFromVTK  -in ${rootPath}/users_data/${user_id}/morphed_vtk/${obj.file_name}.vtu -out ${rootPath}/users_data/${user_id}/rbf/${obj.file_name}_coarse.inp`;
                                        return executeShellCommands(cmd);
                                    })
                                    .then(d => {
                                        console.log('aaaaaaaa ', d)
                                        var fine_cmd = `${rootPath}/MergePolyData/build/InpFromVTK  -in ${rootPath}/users_data/${user_id}/morphed_vtk/${obj.file_name}_fine.vtu -out ${rootPath}/users_data/${user_id}/rbf/${obj.file_name}_fine.inp`;
                                        return executeShellCommands(fine_cmd);
                                    })
                                    .then(d => {
                                        return uploadINPFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadVTKFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadFineINPFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadFineVTKFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadCGValuesAndSetINPStatus(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return createMorphedVTKZip(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadMorphedVTKZip(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return createStlZip(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadStlZip(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadSkullFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadBrainFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        return uploadAvatarModelFile(user_id);
                                    })
                                    .then(d => {
                                        return uploadAvatarModelPlyFile(user_id, obj.file_name);
                                    })
                                    .then(d => {
                                        resolve(true);
                                    })
                                    .catch((err) => {
                                        reject(err);
                                    })
                            }
                        })
                    }
                })
            }
        })

    })
}

function uploadSkullFile(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        fs.readdir(`${rootPath}/users_data/${user_id}/morphed_vtk/`, (err, files) => {
            if (err) {
                console.log('File accessing: ', err);
            }
            files.forEach(file => {
              console.log('File name: ', file);
            });
        });

        const params = uploadParams;
        fs.readFile(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}_skull.ply`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/avatar/skull.ply";
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
    });
}

function uploadBrainFile(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;
        fs.readFile(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}_brain.ply`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/avatar/brain.ply";
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
    });
}

function uploadAvatarModelFile(user_id) {
    var uploadParams = {
        Bucket: config.usersbucket,
        Key: '', // pass key
        Body: null, // pass file body
    };

    const params = uploadParams;
    return new Promise((resolve, reject) => {
        fs.readFile(`./avatars/${user_id}/head/model.jpg`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/avatar/model.jpg";
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
    });
}

function uploadAvatarModelPlyFile(user_id, timestamp) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;
        fs.readFile(`${rootPath}/users_data/${user_id}/stl/${timestamp}_model.ply`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/avatar/model.ply";
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
    });
}

function getUploadedModelFileList(user_name, cb) {
    const s3Params = {
        Bucket: BUCKET_NAME,
        Delimiter: '/',
        Prefix: user_name + '/profile/model/'
        // Key: req.query.key + ''
    };

    s3.listObjectsV2(s3Params, (err, data) => {
        if (err) {
            //   console.log(err);
            cb(err, "");
        }
        cb("", data.Contents);
    });

}

function getFileSignedUrl(key, cb) {

    var params = {
        Bucket: BUCKET_NAME,
        Key: key
    };
    s3.getSignedUrl('getObject', params, function (err, url) {
        if (err) {
            cb(err, "");
        } else {
            cb("", url);
        }
    });
}

// function generateMorphedVTK(obj) {
//     return new Promise((resolve, reject) => {
//         var cmd = `mkdir -p ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/ && python3  ${rootPath}/rbf-brain/RBF_coarse.py  --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/coarse_brain.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtk`;
//         console.log(cmd);
//         let cg_val = '';
//         executeShellCommands(cmd)
//             .then(d => {
//                 console.log("MORPHED VTK POST<<<<<--------------\n", d);
//                 let fiber_cmd = `python3  ${rootPath}/rbf-brain/RBF_coarse.py  --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/fiber_mesh.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fiber.vtk`;
//                 return executeShellCommands(fiber_cmd);
//             })
//             .then(output => {
//                 console.log('Output of fiber mesh ', output);
//                 let cg_cmd = `python3  ${rootPath}/rbf-brain/RBF_CG.py  --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/cg.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_cg.txt`;
//                 return executeShellCommands(cg_cmd);
//             })
//             .then(cg => {
//                 console.log('output of cg value ', cg);
//                 cg_val = cg;
//                 let sensor_cmd = `python3 ${rootPath}/rbf-brain/RBF_CG.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/sensor.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_sensor.txt`;
//                 return executeShellCommands(sensor_cmd);
//             })
//             .then(sensor => {
//                 console.log('output of sensor value ', sensor);
//                 resolve(cg_val);
//             })
//             .catch(err => {
//                 console.log("MORPHED VTK <<<<<--------------\n", err);
//                 reject(err);
//             })
//     })
// }

function generateMorphedVTK(obj) {
    return new Promise((resolve, reject) => {
        var cmd = `mkdir -p ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/ && python3 ${rootPath}/rbf-brain/RBF_coarse.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/coarse_brain.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtk`;
        console.log(cmd);
        let cg_val = '';
        executeShellCommands(cmd)
            .then(d => {
                console.log("MORPHED VTK POST<<<<<--------------\n", d);
                let meshio_cmd = `meshio-convert ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtk ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtu`;
                return executeShellCommands(meshio_cmd);
            })
            .then(d => {
                console.log("MESHIO POST<<<<<--------------\n", d);
                let meshiovtu_cmd = `meshio-ascii ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtu`;
                return executeShellCommands(meshiovtu_cmd);
            })
            .then(d => {
                console.log("MESHIOVTU POST<<<<<--------------\n", d);
                let meshrotate_cmd = `pvpython ${rootPath}/rbf-brain/meshrotate.py --input ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_brain_rotated.vtk`;
                return executeShellCommands(meshrotate_cmd);
            })
            .then(mesh_output => {
                console.log("MESROTATE VTK POST<<<<<--------------\n", mesh_output);
                let fine_mesh_cmd = `python3 ${rootPath}/rbf-brain/RBF_coarse.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/fine_mesh.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine.vtk`;
                return executeShellCommands(fine_mesh_cmd);
            })
            .then(fine_mesh_output => {
                console.log("FINEMESH VTK POST<<<<<--------------\n", fine_mesh_output);
                let fine_meshio_cmd = `meshio-convert ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine.vtk ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine.vtu`;
                return executeShellCommands(fine_meshio_cmd);
            })
            .then(d => {
                console.log("FINE MESHIO POST<<<<<--------------\n", d);
                let fine_meshiovtu_cmd = `meshio-ascii ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine.vtu`;
                return executeShellCommands(fine_meshiovtu_cmd);
            })
            .then(d => {
                console.log("FINE MESHIOVTU POST<<<<<--------------\n", d);
                let fine_rotated_mesh_cmd = `pvpython ${rootPath}/rbf-brain/meshrotate.py --input ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fine_rotated.vtk`;
                return executeShellCommands(fine_rotated_mesh_cmd);
            })
            .then(fine_rotated_mesh_output => {
                console.log("FINEROTATED MESH VTK POST<<<<<--------------\n", fine_rotated_mesh_output);
                let fiber_cmd = `python3 ${rootPath}/rbf-brain/RBF_coarse.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/fiber_mesh.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fiber.vtk`;
                return executeShellCommands(fiber_cmd);
            })
            .then(output => {
                console.log('Output of fiber mesh ', output);
                let meshrotate_cmd2 = `pvpython ${rootPath}/rbf-brain/meshrotate.py --input ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fiber.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_fiber_rotated.vtk`;
                return executeShellCommands(meshrotate_cmd2);
            })
            .then(mesh_output2 => {
                console.log("MESROTATE VTK2 POST<<<<<--------------\n", mesh_output2);
                let extract_surface_cmd = `pvpython ${rootPath}/rbf-brain/extract_surface.py --input ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_brain_rotated.vtk --outputskull ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_skull.ply --outputbrain ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_brain.ply`;
                return executeShellCommands(extract_surface_cmd);
            })
            .then(extract_surface_output => {
                console.log("extract surface <<<<<--------------\n", extract_surface_output);
                let cg_cmd = `python3 ${rootPath}/rbf-brain/RBF_CG.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/cg.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_cg.txt`;
                return executeShellCommands(cg_cmd);
            })
            .then(cg => {
                console.log('output of cg value ', cg);
                cg_val = cg;
                let sensor_cmd = `python3 ${rootPath}/rbf-brain/RBF_CG.py --p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm --m ${rootPath}/rbf-brain/sensor.vtk --output ${rootPath}/users_data/${obj.user_cognito_id}/morphed_vtk/${obj.file_name}_sensor.txt`;
                return executeShellCommands(sensor_cmd);
            })
            // .then(sensor => {
            //     console.log('output of sensor value ', sensor);
            //     resolve(cg_val);
            // })
            .then(sensor => {
                console.log('output of sensor value ', sensor);
                let chophead_cmd = `pvpython ${rootPath}/rbf-brain/chophead.py --input ./avatars/${obj.user_cognito_id}/head/model.ply --output ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_headchopped.stl`;
                return executeShellCommands(chophead_cmd);
            })
            .then(chophead => {
                console.log('output of chophead ', chophead);
                let plytostl_cmd = `pvpython ${rootPath}/rbf-brain/plytostl.py --input ./avatars/${obj.user_cognito_id}/face/model.ply --output ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_face.stl`;
                return executeShellCommands(plytostl_cmd);
            })
            .then(plytostl => {
                console.log('output of plytostl ', plytostl);
                let extractnose_cmd = `python3 ${rootPath}/rbf-brain/extractnose.py --inputhead ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_headchopped.stl --inputface ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_face.stl`;
                return executeShellCommands(extractnose_cmd);
            })
            .then(extractnose => {
                console.log('output of extractnose ', extractnose);
                let headtoface_cmd = `pvpython ${rootPath}/rbf-brain/headtoface.py --inputhead ./avatars/${obj.user_cognito_id}/head/model.ply --outputhead ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_headtrans.ply`;
                return executeShellCommands(headtoface_cmd);
            })
            .then(headtoface => {
                console.log('output of headtoface ', headtoface);
                let textureaddition_cmd = `python3 ${rootPath}/rbf-brain/textureaddition.py --inputheadoriginal ./avatars/${obj.user_cognito_id}/head/model.ply --inputheadtrans ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_headtrans.ply --outputheadtransUV ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}_model.ply`;
                return executeShellCommands(textureaddition_cmd);
            })
            .then(textureaddition => {
                console.log('output of textureaddition ', textureaddition);
                resolve(cg_val);
            })
            .catch(err => {
                console.log("MORPHED VTK <<<<<--------------\n", err);
                reject(err);
            })
    })
}

function uploadCentroidLookUpFile(obj) {
    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`${rootPath}/users_data/${obj.user_cognito_id}/centroid_table/${obj.file_name}.txt`, function (err, headBuffer) {
            if (err) {
                reject(err)
            }
            else {
                params.Key = obj.user_cognito_id + "/profile/centroid_table/" + obj.file_name + ".txt";
                params.Body = headBuffer;
                // Call S3 Upload
                s3.upload(params, (err, data) => {
                    if (err) {
                        console.log("FILE UPLOAD CENTROID", err);
                        reject(err)
                    }
                    else {

                        resolve(data);
                    }
                });

            }
        })

    })
}

function uploadINPFile(user_id, timestamp) {

    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`${rootPath}/users_data/${user_id}/rbf/${timestamp}_coarse.inp`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/rbf/" + timestamp + "_coarse.inp";
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

function uploadVTKFile(user_id, timestamp) {

    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}.vtk`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/rbf/vtk/" + timestamp + "_coarse.vtk";
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
    });

}

function uploadFineINPFile(user_id, timestamp) {

    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`${rootPath}/users_data/${user_id}/rbf/${timestamp}_fine.inp`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/rbf/" + timestamp + "_fine.inp";
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

function uploadFineVTKFile(user_id, timestamp) {

    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`${rootPath}/users_data/${user_id}/morphed_vtk/${timestamp}_fine.vtk`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = user_id + "/profile/rbf/vtk/" + timestamp + "_fine.vtk";
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
    });

}

function generate3DModel(obj) {
    console.log(obj);
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python3", [
            "./config/AvatarTest.py",
            obj.image_url,
            config.avatar3dClientId,
            config.avatar3dclientSecret,
            obj.user_cognito_id
        ]);
        pythonProcess.stdout.on("data", data => {

            execFile('zip', ['-r', `./avatars/${obj.user_cognito_id}.zip`, `./avatars/${obj.user_cognito_id}/`], function (err, stdout) {
                if (err) {
                    console.log("ERROR in file upload ", err);
                    reject(err);
                }
                else {
                    console.log("", stdout);
                    resolve(stdout);
                }
            });
        })
        pythonProcess.stderr.on("data", data => {
            console.log(`error:${data}`);
            reject(data);

        });
        pythonProcess.on("close", data => {
            if (data == "1" || data == 1) {
                reject(data);
            }
            console.log(`child process close with ${data}`)
        });
    })
}

function upload3DModelZip(obj) {
    return new Promise((resolve, reject) => {
        console.log("IN UPLOAD MODEL");
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: `${obj.user_cognito_id}/profile/model/${obj.file_name}.zip`, // pass key
            Body: null,
        };
        fs.readFile(`./avatars/${obj.user_cognito_id}.zip`, function (err, headBuffer) {
            if (err) {
                console.log(err);
                reject(err);
            }
            else {
                uploadParams.Body = headBuffer;
                s3.upload(uploadParams, (err, data) => {
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
function executeShellCommands(cmd) {
    return new Promise((resolve, reject) => {
        var command = spawn(cmd, { shell: true })
        var result = ''
        command.stdout.on('data', function (data) {
            result += data.toString()
        })
        command.on('close', function (code) {
            resolve(result)
        })
        command.on('error', function (err) { reject(err) })
    })
}

function uploadGeneratedSelfieImage(obj) {

    return new Promise((resolve, reject) => {
        var uploadParams = {
            Bucket: config.usersbucket,
            Key: '', // pass key
            Body: null, // pass file body
        };

        const params = uploadParams;

        fs.readFile(`./avatars/${obj.user_cognito_id}/head/${obj.file_name}.png`, function (err, headBuffer) {
            if (err) {
                reject(err);
            }
            else {
                params.Key = `${obj.user_cognito_id}/profile/image/${obj.file_name}.png`;
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

    });

}

function generateStlFromPly(obj) {
    return new Promise((resolve, reject) => {
        var cmd = `mkdir -p ${rootPath}/users_data/${obj.user_cognito_id}/stl/ && pvpython ${rootPath}/rbf-brain/extract.py --input ./avatars/${obj.user_cognito_id}/face/model.ply --output ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}.stl`
        console.log(cmd);
        executeShellCommands(cmd)
            .then(d => {
                console.log("POST CONSOLE OF STL GENERATION", d);
                resolve(d);
            })
            .catch(err => {
                console.log("ERROR in stl generations <<<<<--------------\n", err);
                reject(err);
            })
    })
}

function generateParametersFileFromStl(obj) {
    return new Promise((resolve, reject) => {
        console.log("THI IS PRESENT WORKING DIRECTORY ", __dirname);
        var cmd = `mkdir -p ${rootPath}/users_data/${obj.user_cognito_id}/parameters/ && pvpython ${rootPath}/rbf-brain/controlpoints.py --input ${rootPath}/users_data/${obj.user_cognito_id}/stl/${obj.file_name}.stl --output ${rootPath}/users_data/${obj.user_cognito_id}/parameters/${obj.file_name}.prm`
        console.log(cmd)
        executeShellCommands(cmd)
            .then(d => {
                console.log("POST CONSOLE OF PRM GENERATION", d);
                resolve(d);
            })
            .catch(err => {
                console.log("ERROR in PRM generations <<<<<--------------\n", err);
                reject(err);
            })
    })
}

function generateSimulationForPlayers(player_data_array, reader, apiMode, sensor, mesh, account_id) {
    return new Promise((resolve, reject) => {
        var counter = 0;
        var simulation_result_urls = [];

        // Array that will store all the impact data that will be sent for simulation processing

        var simulation_data = [];
        player_data_array.forEach((player, j) => {

            var _temp_player = player;
            var index = j;
            var token_secret = shortid.generate();
            generateJWTokenWithNoExpiry({ image_id: _temp_player.image_id }, token_secret)
                .then(image_token => {

                    let player_id = _temp_player.player_id.split("$")[0] + '-' + _temp_player.sensor;
                    player_id = player_id.replace(/ /g, "-");

                    let user_bucket = apiMode === 'beta' ? config.usersbucketbeta : config.usersbucket;
                    updateSimulationImageToDDB(_temp_player.image_id, user_bucket, "null", "pending", image_token, token_secret)
                        .then(value => {
                            return fetchCGValues(account_id);
                        })
                        .then(playerDetail => {
                            let cg_coordinates =  playerDetail.length > 0 && playerDetail[0]['cg_coordinates'] ? playerDetail[0]['cg_coordinates'] : null;
                            console.log('CG coordinates are ', cg_coordinates);

                            // console.log("LOOPING THROUGH COMPONENTS ++++++++++ !!!!! ",index ,_temp_player);

                            simulation_result_urls.push(`${config_env.simulation_result_host_url}simulation/results/${image_token}/${_temp_player.image_id}`);
                            simulation_result_urls.push(`${config_env.simulation_result_host_url}getSimulationMovie/${image_token}/${_temp_player.image_id}`);

                            let playerData = {
                                "uid": "",
                                "player": {
                                    "first-name": "",
                                    "first-name": "",
                                    "sport": "",
                                    "team": "",
                                    "position": ""
                                },
                                "sensor": "",
                                "simulation": {
                                    "mesh": mesh === 'fine' ? "fine_brain.inp" : "coarse_brain.inp",
                                    "linear-acceleration": [0.0, 0.0, 0.0],
                                    "angular-acceleration": 0.0,
                                    //"time-peak-acceleration": 2.0e-2,
                                    "maximum-time": 4.0e-2,
                                    //"impact-point": "",
                                    "head-cg": [0, -0.3308, -0.037],
                                    "angular-sensor-position": [0.025, -0.281, -0.089757]
                                }
                            }
                            if (cg_coordinates) {
                                playerData.simulation["head-cg"] = (cg_coordinates.length == 0) ? [0, -0.3308, -0.037] : cg_coordinates.map(function (x) { return parseFloat(x) });
                                playerData.simulation["angular-sensor-position"] = (cg_coordinates.length == 0) ? [0.025, -0.281, -0.089757] : cg_coordinates.map(function (x) { return parseFloat(x) });
                            }

                            if (sensor === 'prevent' ) {
                                delete playerData.simulation["angular-sensor-position"];
                            }

                            playerData["player"]["name"] = _temp_player.player_id.replace(/ /g, "-");
                            // playerData["uid"] = _temp_player.player_id.split("$")[0].replace(/ /g, "-") + '_' + _temp_player.image_id;
                            playerData["uid"] = _temp_player.image_id;

                            if (reader == 1 || reader == 2) {
                                
                                playerData["sensor"] = _temp_player.sensor;
                                playerData["player"]["first-name"] = _temp_player.player['first-name']
                                playerData["player"]["last-name"] = _temp_player.player['last-name'];
                                playerData["player"]["sport"] = _temp_player.player.sport;
                                playerData["player"]["team"] = _temp_player.player.team;
                                playerData["player"]["position"] = _temp_player.player.position;

                                delete _temp_player['linear-acceleration']['xv-g'];
                                delete _temp_player['linear-acceleration']['yv-g'];
                                delete _temp_player['linear-acceleration']['zv-g'];

                                playerData["simulation"]["linear-acceleration"] = _temp_player['linear-acceleration'];
                                playerData["simulation"]["angular-acceleration"] = _temp_player['angular-acceleration'];
                    
                                if (reader == 2) {
                                    playerData["simulation"]["maximum-time"] = _temp_player.max_time * 1000;
                                } else {
                                    playerData["simulation"]["maximum-time"] = parseFloat(_temp_player['linear-acceleration']['xt'][_temp_player['linear-acceleration']['xt'].length - 1]);
                                }

                                if (sensor === 'prevent' || sensor === 'Prevent') {
                                    playerData["simulation"]["mesh-transformation"] = ["-y", "z", "-x"];
                                } else if (sensor === 'sensor_company_x' || sensor === 'swa' || sensor === 'SWA') {
                                    playerData["simulation"]["mesh-transformation"] = ["-z", "x", "-y"];
                                    playerData["simulation"]["angular-to-linear-frame"] = ["-y", "-x", "z"];
                                } else if (sensor === 'sisu' || sensor === 'SISU') {
                                    playerData["simulation"]["mesh-transformation"] = ["-z", "-x", "y"];
                                } else if (sensor === 'stanford' || sensor === 'Stanford') {
                                    playerData["simulation"]["mesh-transformation"] = ["y", "-z", "-x"];
                                } else if (sensor === 'hybrid3' || sensor === 'Hybrid3') {
                                    // playerData["simulation"]["mesh-transformation"] = ["z", "-x", "-y"];
                                    playerData["simulation"]["mesh-transformation"] = ["-y", "z", "-x"];
                                } else {
                                    playerData["simulation"]["mesh-transformation"] = ["-y", "z", "-x"];
                                }

                                // playerData["simulation"]["mesh-transformation"] = _temp_player['mesh-transformation'];
                            } else {

                                playerData["player"]["position"] = _temp_player.position.toLowerCase();
                                playerData["simulation"]["linear-acceleration"][0] = _temp_player.linear_acceleration_pla;
                                playerData["simulation"]["angular-acceleration"] = _temp_player.angular_acceleration_paa;
                                //playerData["simulation"]["impact-point"] = _temp_player.impact_location_on_head.toLowerCase().replace(/ /g, "-");
                            }

                            let temp_simulation_data = {
                                "impact_data": playerData,
                                "index": index,
                                "image_id": _temp_player.image_id,
                                "image_token": image_token,
                                "token_secret": token_secret,
                                "date": _temp_player.date.split("/").join("-"),
                                "player_id": player_id,
                                "account_id": account_id,
                                "user_cognito_id": playerDetail[0].user_cognito_id,
                            }

                            if ("impact" in _temp_player) {
                                temp_simulation_data["impact"] = _temp_player.impact
                            }

                            simulation_data.push(temp_simulation_data);

                            counter++;

                            if (counter == player_data_array.length) {
                                console.log('SIMULATION DATA IS ', JSON.stringify(simulation_data));
                                // Uploading simulation data file
                                upload_simulation_data(simulation_data)
                                    .then(job => {
                                        // Submitting simulation job
                                        return submitJobsToBatch(simulation_data, job.job_id, job.path, apiMode);
                                    })
                                    .then(value => {
                                        console.log('simulation_result_urls ', simulation_result_urls);
                                        resolve(simulation_result_urls);
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        reject(err);
                                    })

                            }

                        })
                        .catch(err => {
                            console.log(err);
                            counter = result.length;
                            j = player_data_array.length;
                            reject(err)
                        })
                })
                .catch(err => {

                    console.log(err);
                    counter = result.length;
                    j = player_data_array.length;
                    reject(err)
                })
        })
    })
}

function generateSimulationForPlayersFromJson(player_data_array, apiMode, mesh, account_id) {
    return new Promise((resolve, reject) => {
        var counter = 0;
        var simulation_result_urls = [];

        // Array that will store all the impact data that will be sent for simulation processing

        var simulation_data = [];
        player_data_array.forEach((player, j) => {

            var _temp_player = player;
            var index = j;
            var token_secret = shortid.generate();
            generateJWTokenWithNoExpiry({ image_id: _temp_player.image_id }, token_secret)
                .then(image_token => {

                    let player_id = _temp_player.player_id.split("$")[0] + '-' + _temp_player.sensor;
                    player_id = player_id.replace(/ /g, "-");

                    let user_bucket = apiMode === 'beta' ? config.usersbucketbeta : config.usersbucket;
                    updateSimulationImageToDDB(_temp_player.image_id, user_bucket, "null", "pending", image_token, token_secret)
                        .then(value => {
                            return fetchCGValues(account_id);
                        })
                        .then(playerDetail => {
                            let cg_coordinates =  playerDetail.length > 0 && playerDetail[0]['cg_coordinates'] ? playerDetail[0]['cg_coordinates'] : null;
                            console.log('CG coordinates are ', cg_coordinates);

                            // console.log("LOOPING THROUGH COMPONENTS ++++++++++ !!!!! ",index ,_temp_player);

                            simulation_result_urls.push(`${config_env.simulation_result_host_url}simulation/results/${image_token}/${_temp_player.image_id}`);
                            simulation_result_urls.push(`${config_env.simulation_result_host_url}getSimulationMovie/${image_token}/${_temp_player.image_id}`);

                            let playerData = {
                                "uid": "",
                                "player": {
                                    "first-name": "",
                                    "first-name": "",
                                    "sport": "",
                                    "team": "",
                                    "position": "",
                                    "organization": "",
                                    "impact-id": "",
                                },
                                "sensor": "",
                                "impact-date": "",
                                "impact-time": "",
                                "player_id": "",
                                "simulation": {
                                    "mesh": mesh === 'fine' ? "fine_brain.inp" : "coarse_brain.inp",
                                    "time": "",
                                    "time-units": "",
                                    "linear-acceleration": [0.0, 0.0, 0.0],
                                    "angular-acceleration": [0.0, 0.0, 0.0],
                                    //"time-peak-acceleration": 2.0e-2,
                                    "maximum-time": 4.0e-2,
                                    "head-cg": [0, -0.3308, -0.037],
                                    //"impact-point": "",
                                    "angular-sensor-position": [0.025, -0.281, -0.089757]
                                }
                            }

                            // playerData["uid"] = _temp_player.player_id.split("$")[0].replace(/ /g, "-") + '_' + _temp_player.image_id;
                            playerData["uid"] = _temp_player.image_id;
                            playerData["sensor"] = _temp_player.sensor;
                            playerData["impact-date"] = _temp_player['impact-date'].split(":").join("-");
                            playerData["impact-time"] = _temp_player['impact-time'];
                            playerData["player_id"] = player_id
                            // playerData["organization"] = _temp_player.organization;

                            playerData["player"]["first-name"] = _temp_player.player['first-name'];
                            playerData["player"]["last-name"] = _temp_player.player['last-name'];
                            playerData["player"]["sport"] = _temp_player.player.sport;
                            playerData["player"]["team"] = _temp_player.player.team;
                            playerData["player"]["position"] = _temp_player.player.position;
                            playerData["player"]["organization"] = _temp_player.player.organization ? _temp_player.player.organization : 'Unknown';
                            playerData["player"]["impact-id"] = _temp_player.player['impact-id'] ? _temp_player.player['impact-id'] : ''
                            
                            playerData["simulation"]["time"] = _temp_player.simulation.time;
                            playerData["simulation"]["time-units"] = _temp_player.simulation['time-units'];

                            delete _temp_player.simulation['linear-acceleration']['xv-g'];
                            delete _temp_player.simulation['linear-acceleration']['yv-g'];
                            delete _temp_player.simulation['linear-acceleration']['zv-g'];

                            playerData["simulation"]["linear-acceleration"] = _temp_player.simulation['linear-acceleration'];
                            playerData["simulation"]["angular-acceleration"] = _temp_player.simulation['angular-acceleration'];
                            playerData["simulation"]["maximum-time"] = parseFloat(_temp_player.simulation['linear-acceleration']['xt'][_temp_player.simulation['linear-acceleration']['xt'].length - 1]);
                            // playerData["simulation"]["maximum-time"] = _temp_player["maximum-time"];
                            playerData["simulation"]["mesh-transformation"] = _temp_player.simulation['mesh-transformation'];

                            if (cg_coordinates) {
                                playerData.simulation["head-cg"] = (cg_coordinates.length == 0) ? [0, -0.3308, -0.037] : cg_coordinates.map(function (x) { return parseFloat(x) });
                                playerData.simulation["angular-sensor-position"] = (cg_coordinates.length == 0) ? [0.025, -0.281, -0.089757] : cg_coordinates.map(function (x) { return parseFloat(x) });
                            }

                            if (_temp_player.simulation['head-cg']) {
                                playerData.simulation["head-cg"] = _temp_player.simulation["head-cg"]
                            }

                            if (_temp_player.simulation['maximum-time']) {
                                playerData.simulation["maximum-time"] = _temp_player.simulation["maximum-time"]
                            }

                            if (_temp_player["sensor"] && _temp_player["sensor"] === 'Prevent Biometrics') {
                                delete playerData.simulation["angular-sensor-position"];
                            }

                            if (_temp_player.simulation['angular-to-linear-frame']) {
                                playerData["simulation"]["angular-to-linear-frame"] = _temp_player.simulation['angular-to-linear-frame'];
                            }

                            if (_temp_player['time-peak-acceleration']) {
                                playerData["simulation"]["time-peak-acceleration"] = _temp_player['time-peak-acceleration'];
                            }
                           
                            let temp_simulation_data = {
                                "impact_data": playerData,
                                "index": index,
                                "image_id": _temp_player.image_id,
                                "image_token": image_token,
                                "token_secret": token_secret,
                                "date": _temp_player['impact-date'].split(":").join("-"),
                                "player_id": player_id,
                                "account_id": account_id,
                                "user_cognito_id": playerDetail[0].user_cognito_id,
                            }

                            if ("impact" in _temp_player) {
                                temp_simulation_data["impact"] = _temp_player.impact
                            }

                            simulation_data.push(temp_simulation_data);

                            counter++;

                            if (counter == player_data_array.length) {
                                console.log('SIMULATION DATA JSON IS ', JSON.stringify(simulation_data));
                                // Uploading simulation data file
                                upload_simulation_data(simulation_data)
                                    .then(job => {
                                        // Submitting simulation job
                                        return submitJobsToBatch(simulation_data, job.job_id, job.path, apiMode);
                                    })
                                    .then(value => {
                                        console.log('simulation_result_urls ', simulation_result_urls);
                                        resolve(simulation_result_urls);
                                    })
                                    .catch(err => {
                                        console.log(err);
                                        reject(err);
                                    })
                            }
                        })
                        .catch(err => {
                            console.log(err);
                            counter = result.length;
                            j = player_data_array.length;
                            reject(err)
                        })
                })
                .catch(err => {

                    console.log(err);
                    counter = result.length;
                    j = player_data_array.length;
                    reject(err)
                })
        })
    })
}

function upload_simulation_data(simulation_data) {
    return new Promise((resolve, reject) => {

        let job_id = Math.random().toString(36).slice(2, 12);
        let path = new Date().toISOString().slice(0, 10) + `/${job_id}.json`;
        let uploadParams = {
            Bucket: config.simulation_bucket,
            Key: path, // pass key
            Body: JSON.stringify(simulation_data).replace(/ /g, "")
        };
        s3.upload(uploadParams, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve({ job_id: job_id, path: path });
            }
        });

    })
}

function generateJWTokenWithNoExpiry(obj, secret) {
    return new Promise((resolve, reject) => {
        console.log('Generating jwt secret with no expiry');
        jwt.sign(obj, secret, (err, token) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(token);
            }
        })
    })
}

function submitJobsToBatch(simulation_data, job_name, file_path, apiMode) {
    return new Promise((resolve, reject) => {
        const array_size = simulation_data.length;
        let simulation_params = {
            jobDefinition: apiMode === 'beta' ? config.jobDefinitionBeta : config.jobDefinitionProduction, /* required */
            jobName: job_name, /* required */
            jobQueue: apiMode === 'beta' ?  config.jobQueueBeta : config.jobQueueProduction, /* required */
            parameters: {
                'simulation_data': `s3://${config.simulation_bucket}/${file_path}`,
            },
            containerOverrides: {
                command: [
                    'bash',
                    'simulation.sh',
                    'Ref::simulation_data'
                    /* more items */
                ]
            }
        };

        if (array_size > 1) {
            simulation_params['arrayProperties'] = {
                size: array_size
            }
        }

        batch.submitJob(simulation_params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                reject(err);
            } else {
                // console.log(data);
                let cnt = 0;
                simulation_data.forEach((value) => {
                    let obj = {};
                    obj.image_id = value.image_id;
                    obj.job_id = array_size > 1 ? data.jobId + ':' + value.index : data.jobId;
                    // console.log(obj);
                    updateSimulationData(obj, function (err, dbdata) {
                        if (err) {
                            reject(err);
                        }
                        else {
                            cnt++;
                            if (cnt === array_size) {
                                console.log(data);
                                resolve(data);
                            }
                        }
                    })
                })
            }
        })
    })
}

function parseDate(date, arg, timezone) {
    // var result = 0, arr = arg.split(':')

    arg = arg.replace(".", ":");
    var t = arg.split(":");
    var milliseconds;
    var time_type;
    milliseconds = t[3].split(" ")[0];
    // x stores parsed time format
    var x = "";
    if (t[3].indexOf('P') > -1) {
        x = `${t[0]}:${t[1]}:${t[2]} ${t[3].split(" ")[1]}`
    }
    return moment.utc(date + " , " + x, 'MM/DD/YYYY , hh:mm:ss a', true).milliseconds(Number(milliseconds)).valueOf();
}

function cleanUp(obj) {
    return new Promise((resolve, reject) => {
        console.log("Clean is called");
        executeShellCommands(`rm -fr ${rootPath}/users_data/${obj.user_cognito_id}/ ; rm -rf ./avatars/${obj.user_cognito_id}/ ; rm -f ./avatars/${obj.user_cognito_id}.zip;`)
            .then(d => {
                resolve(d);
            })
            .catch(err => {
                reject(err);

            })
    })
}

module.exports = {
    convertFileDataToJson,
    storeSensorData,
    addPlayerToTeamOfOrganization,
    uploadPlayerSelfieIfNotPresent,
    generateSimulationForPlayers,
    generateSimulationForPlayersFromJson,
    computeImageData,
    generateINP
};
