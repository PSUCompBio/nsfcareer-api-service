const AWS = require("aws-sdk");

const docClient = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true,
});

function getUserDetails(user_name, cb) {
    return new Promise((resolve, reject) => {
        var db_table = {
            TableName: "users",
            Key: {
                user_cognito_id: user_name,
            },
        };
        docClient.get(db_table, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function updateSimulationFileStatusInDB(obj) {
    return new Promise((resolve, reject) => {
        var userParams = {
            TableName: "users",
            Key: {
                user_cognito_id: obj.user_cognito_id,
            },
            UpdateExpression:
                "set is_selfie_simulation_file_uploaded = :is_selfie_simulation_file_uploaded",
            ExpressionAttributeValues: {
                ":is_selfie_simulation_file_uploaded": true,
            },
            ReturnValues: "UPDATED_NEW",
        };
        docClient.update(userParams, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function updateIRBFormStatusInDDB(obj, cb) {
    var userParams = {
        TableName: "users",
        Key: {
            user_cognito_id: obj.user_cognito_id,
        },
        UpdateExpression: "set is_IRB_complete = :is_IRB_complete",
        ExpressionAttributeValues: {
            ":is_IRB_complete": true,
        },
        ReturnValues: "UPDATED_NEW",
    };
    docClient.update(userParams, (err, data) => {
        if (err) {
            cb(err, "");
        } else {
            cb("", data);
        }
    });
}

function addTeam(obj) {
    return new Promise((resolve, reject) => {
        var dbInsert = {
            TableName: "teams",
            Item: obj,
        };
        docClient.put(dbInsert, function (err, data) {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function deleteTeam(obj) {
    console.log("IN delete functionality");
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "teams",
            Key: {
                organization: obj.organization,
                team_name: obj.team_name,
            },
        };
        docClient.delete(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function fetchAllTeamsInOrganization(org) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "teams",
            KeyConditionExpression: "organization = :organization",
            ExpressionAttributeValues: {
                ":organization": org,
            },
        };
        var item = [];
        docClient.query(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function scanSensorDataTable() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensor_data",
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function deleteTeamFromOrganizationList(org, team_name) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "teams",
            Key: {
                organization: org,
                team_name: "teams",
            },
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                var item = data.Item;
                var updatedList = item.team_list.filter(function (team) {
                    return team != team_name;
                });
                console.log(updatedList);
                var dbInsert = {
                    TableName: "teams",
                    Key: {
                        organization: org,
                        team_name: "teams",
                    },
                    UpdateExpression: "set #list = :newItem ",
                    ExpressionAttributeNames: {
                        "#list": "team_list",
                    },
                    ExpressionAttributeValues: {
                        ":newItem": updatedList,
                    },
                    ReturnValues: "UPDATED_NEW",
                };
                docClient.update(dbInsert, function (err, data) {
                    if (err) {
                        console.log("ERROR WHILE DELETING DATA", err);
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            }
        });
    });
}

function addTeamToOrganizationList(org, team_name) {
    return new Promise((resolve, reject) => {
        // if flag is true it means data array is to be created
        let params = {
            TableName: "teams",
            Key: {
                organization: org,
                team_name: "teams",
            },
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                console.log("DATA IS ADD USER TO ORG ", data);
                if (Object.keys(data).length == 0 && data.constructor === Object) {
                    var dbInsert = {
                        TableName: "teams",
                        Item: {
                            organization: org,
                            team_name: "teams",
                            team_list: [team_name],
                        },
                    };
                    docClient.put(dbInsert, function (err, data) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                } else {
                    var dbInsert = {
                        TableName: "teams",
                        Key: {
                            organization: org,
                            team_name: "teams",
                        },
                        UpdateExpression: "set #list = list_append(#list, :newItem)",
                        ExpressionAttributeNames: {
                            "#list": "team_list",
                        },
                        ExpressionAttributeValues: {
                            ":newItem": [team_name],
                        },
                        ReturnValues: "UPDATED_NEW",
                    };

                    docClient.update(dbInsert, function (err, data) {
                        if (err) {
                            console.log("ERROR WHILE CREATING DATA", err);
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                }
            }
        });
    });
}

function getCumulativeAccelerationData(obj) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensor_data",
            KeyConditionExpression:
                "team = :team and begins_with(player_id,:player_id)",
            ExpressionAttributeValues: {
                ":player_id": obj.player_id,
                ":team": obj.team,
            },
        };
        var item = [];
        docClient.query(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function getTeamDataWithPlayerRecords(obj) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensor_data",
            KeyConditionExpression:
                "team = :team and begins_with(player_id,:player_id)",
            ExpressionAttributeValues: {
                ":player_id": obj.player_id,
                ":team": obj.team,
            },
        };
        var item = [];
        docClient.query(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function getTeamData(obj) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensor_data",
            KeyConditionExpression: "team = :team",
            ExpressionAttributeValues: {
                ":team": obj.team,
            },
        };
        var item = [];
        docClient.query(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function getCumulativeSensorData(obj) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensor_data",
            KeyConditionExpression:
                "team = :team and begins_with(player_id,:player_id)",
            ExpressionAttributeValues: {
                ":team": obj.team,
                ":player_id": obj.player_id,
            },
        };
        var item = [];
        docClient.query(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        });
    });
}

function getPlayersListFromTeamsDB(obj) {
    return new Promise((resolve, reject) => {
        var db_table = {
            TableName: "teams",
            Key: {
                organization: obj.organization,
                team_name: obj.team_name,
            },
        };
        docClient.get(db_table, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data.Item);
            }
        });
    });
}

function storeSensorData(sensor_data_array) {
    return new Promise((resolve, reject) => {
        var counter = 0;
        if (sensor_data_array.length == 0) {
            resolve(true);
        }
        for (var i = 0; i < sensor_data_array.length; i++) {
            let param = {
                TableName: "sensor_data",
                Item: sensor_data_array[i],
            };

            docClient.put(param, function (err, data) {
                counter++;
                if (err) {
                    console.log(err);
                    reject(err);
                }
                if (counter == sensor_data_array.length) {
                    resolve(true);
                }
            });
        }
    });
}

function addPlayerToTeamInDDB(org, team, player_id) {
    return new Promise((resolve, reject) => {
        // if flag is true it means data array is to be created
        let params = {
            TableName: "teams",
            Key: {
                organization: org,
                team_name: team,
            },
        };

        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                if (Object.keys(data).length == 0 && data.constructor === Object) {
                    var dbInsert = {
                        TableName: "teams",
                        Item: {
                            organization: org,
                            team_name: team,
                            player_list: [player_id],
                        },
                    };
                    docClient.put(dbInsert, function (err, data) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    });
                } else {
                    // If Player does not exists in Team
                    if (data.Item.player_list.indexOf(player_id) <= -1) {
                        var dbInsert = {
                            TableName: "teams",
                            Key: {
                                organization: org,
                                team_name: team,
                            },
                            UpdateExpression: "set #list = list_append(#list, :newItem)",
                            ExpressionAttributeNames: {
                                "#list": "player_list",
                            },
                            ExpressionAttributeValues: {
                                ":newItem": [player_id],
                            },
                            ReturnValues: "UPDATED_NEW",
                        };

                        docClient.update(dbInsert, function (err, data) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(data);
                            }
                        });
                    } else {
                        resolve("PLAYER ALREADY EXISTS IN TEAM");
                    }
                }
            }
        });
    });
}

function checkIfSelfiePresent(player_id) {
    return new Promise((resolve, reject) => {
        //Fetch user details from dynamodb
        let params = {
            TableName: "users",
            Key: {
                user_cognito_id: player_id,
            },
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                console.log("check if selfie present ", data);
                if (
                    (Object.keys(data).length == 0 && data.constructor === Object) ||
                    ("is_selfie_image_uploaded" in data.Item &&
                        data.Item.is_selfie_image_uploaded == false)
                ) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            }
        });
    });
}

function updateSelfieAndModelStatusInDB(obj, cb) {
    var userParams = {
        TableName: "users",
        Key: {
            user_cognito_id: obj.user_cognito_id,
        },
        UpdateExpression:
            "set is_selfie_image_uploaded = :selfie_image_uploaded, is_selfie_model_uploaded = :selfie_model_uploaded",
        ExpressionAttributeValues: {
            ":selfie_model_uploaded": true,
            ":selfie_image_uploaded": true,
        },
        ReturnValues: "UPDATED_NEW",
    };
    docClient.update(userParams, (err, data) => {
        if (err) {
            cb(err, "");
        } else {
            cb("", data);
        }
    });
}

function updateINPFileStatusInDB(obj, cb) {
    var userParams = {
        TableName: "users",
        Key: {
            user_cognito_id: obj.user_cognito_id,
        },
        UpdateExpression: "set is_selfie_inp_uploaded = :is_selfie_inp_uploaded",
        ExpressionAttributeValues: {
            ":is_selfie_inp_uploaded": true,
        },
        ReturnValues: "UPDATED_NEW",
    };
    docClient.update(userParams, (err, data) => {
        if (err) {
            cb(err, "");
        } else {
            cb("", data);
        }
    });
}

function updateSimulationImageToDDB(
    image_id,
    bucket_name,
    path,
    status = "completed",
    token = null,
    secret = null
) {
    return new Promise((resolve, reject) => {
        if (image_id == null) {
            return resolve({ message: "No Image Simulation ID provided" });
        } else {
            // if flag is true it means data array is to be created
            let params = {
                TableName: "simulation_images",
                Key: {
                    image_id: image_id,
                },
            };
            docClient.get(params, function (err, data) {
                if (err) {
                    reject(err);
                } else {
                    if (Object.keys(data).length == 0 && data.constructor === Object) {
                        var dbInsert = {
                            TableName: "simulation_images",
                            Item: {
                                image_id: image_id,
                                bucket_name: bucket_name,
                                path: path,
                                status: status,
                                token: token,
                                secret: secret,
                            },
                        };
                        docClient.put(dbInsert, function (err, data) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            } else {
                                resolve(data);
                            }
                        });
                    } else {
                        // If Player does not exists in Team
                        var dbInsert = {
                            TableName: "simulation_images",
                            Key: { image_id: image_id },
                            UpdateExpression: "set #path = :path,#status = :status",
                            ExpressionAttributeNames: {
                                "#path": "path",
                                "#status": "status",
                            },
                            ExpressionAttributeValues: {
                                ":path": path,
                                ":status": status,
                            },
                            ReturnValues: "UPDATED_NEW",
                        };

                        docClient.update(dbInsert, function (err, data) {
                            if (err) {
                                console.log("ERROR WHILE CREATING DATA", err);
                                reject(err);
                            } else {
                                resolve(data);
                            }
                        });
                    }
                }
            });
        }
    });
}

module.exports = {
    getUserDetails,
    updateSimulationFileStatusInDB,
    updateIRBFormStatusInDDB,
    addTeam,
    deleteTeam,
    fetchAllTeamsInOrganization,
    scanSensorDataTable,
    deleteTeamFromOrganizationList,
    addTeamToOrganizationList,
    getCumulativeAccelerationData,
    getTeamDataWithPlayerRecords,
    getTeamData,
    getCumulativeSensorData,
    getPlayersListFromTeamsDB,
    storeSensorData,
    addPlayerToTeamInDDB,
    checkIfSelfiePresent,
    updateSelfieAndModelStatusInDB,
    updateINPFileStatusInDB,
    updateSimulationImageToDDB,
};
