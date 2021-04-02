const AWS = require("aws-sdk");
const rootPath = '/home/ec2-user';

const docClient = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true,
});

function concatArrays(arrays) {
    return [].concat.apply([], arrays);
}

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

function getUserDetailBySensorId(sensor, sensor_id_number) {
    return new Promise((resolve, reject) => {
        let params;
        if (sensor) {
            params = {
                TableName: "users",
                FilterExpression: "sensor = :sensor and sensor_id_number = :sensor_id_number",
                ExpressionAttributeValues: {
                    ":sensor": sensor,
                    ":sensor_id_number": sensor_id_number
                }
            };
        } else {
            params = {
                TableName: "users",
                FilterExpression: "sensor_id_number = :sensor_id_number",
                ExpressionAttributeValues: {
                    ":sensor_id_number": sensor_id_number
                }
            };
        }
        
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

function getUserDetailByPlayerId(sensor_id_number) {
    return new Promise((resolve, reject) => {
        let params;
       
        params = {
            TableName: "users",
            FilterExpression: "player_id = :player_id",
            ExpressionAttributeValues: {
                ":player_id": sensor_id_number
            }
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



function addPlayer(obj) {
    return new Promise((resolve, reject) => {
        var dbInsert = {
            TableName: "users",
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

function getTeamDataWithPlayerRecords(obj) {

    return new Promise((resolve, reject) => {
        const player_obj = {};
        player_obj.organization = obj.organization;
        player_obj.team_name = obj.team;
        if (obj.sensor && obj.sensor != 'null') {
            player_obj.sensor = obj.sensor;
        }
        getOrganizationData(player_obj)
            .then (org => {
                if (org.length > 0) {
                    let params;
                    if (obj.sensor && obj.sensor != 'null') {						
						params = {org_id : org[0].organization_id,sensor:obj.sensor,organization : obj.organization , team :obj.team,player_id :   {$regex: obj.player_id, $options: 'i'}}
                       /* params = {
                            TableName: "sensor_details",
                            KeyConditionExpression:  "org_id = :org_id and begins_with(player_id,:player_id)",
                            FilterExpression: "sensor = :sensor and organization = :organization and team = :team",
                            ExpressionAttributeValues: {
                                ":org_id": org[0].organization_id,
                                ":sensor": obj.sensor,
                                ":organization": obj.organization,
                                ":team": obj.team,
                                ":player_id": obj.player_id + '$',
                            },
                            ExpressionAttributeNames : {
                                '#time': 'time',
                                '#date': 'date',
                                '#Impact_date': 'impact-date',
                                '#Impact_time': 'impact-time'
                            },
                            ProjectionExpression: " #time, #date,#Impact_date,#Impact_time, image_id,organization,player,player_id,sensor,simulation_status,team,user_cognito_id",
                            ScanIndexForward: false
                        };*/
                    } else {
							
						params = {org_id : org[0].organization_id,organization : obj.organization , team :obj.team,player_id :   {$regex: obj.player_id, $options: 'i'}}
                       /* params = {
                            TableName: "sensor_details",
                            KeyConditionExpression:  "org_id = :org_id and begins_with(player_id,:player_id)",
                            FilterExpression: "organization = :organization and team = :team",
                            ExpressionAttributeValues: {
                                ":org_id": org[0].organization_id,
                                ":organization": obj.organization,
                                ":team": obj.team,
                                ":player_id": obj.player_id + '$',
                            },
                            ExpressionAttributeNames : {
                                '#time': 'time',
                                '#date': 'date',
                                '#Impact_date': 'impact-date',
                                '#Impact_time': 'impact-time'
                            },
                            ProjectionExpression: " #time, #date,#Impact_date,#Impact_time, image_id,organization,player,player_id,sensor,simulation_status,team,user_cognito_id",
                            ScanIndexForward: false
                        };*/
                    }
					
				  const sensorDetails = require("../models/sensors/sensorDetailsData");		
						var item = [];
						sensorDetails.find(params, function (err, details) {
							if (err) {
								reject(err);
							}
							if (details == null) {
								resolve([]);
							} else {
								resolve(details);
							}
						}); 
						/*
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
                    });*/
                } else {
                    resolve([]);
                }
            })    
    });
}

function getTeamData(obj) {
    return new Promise((resolve, reject) => {
        const player_obj = {};
        player_obj.organization = obj.organization;
        player_obj.team_name = obj.team;
        if (obj.brand && obj.brand != 'null') {
            player_obj.sensor = obj.brand;
        }
        getOrganizationData(player_obj)
            .then (org => {
                if (org.length > 0) {
                    let params;
                    if (obj.brand && obj.brand != 'null') {
						
						params = {org_id : org[0].organization_id,sensor : obj.brand ,organization : obj.organization , team :obj.team};
                       /* params = {
                            TableName: "sensor_details",
                            KeyConditionExpression:  "org_id = :org_id",
                            FilterExpression: "sensor = :sensor and organization = :organization and team = :team",
                            ExpressionAttributeValues: {
                                ":org_id": org[0].organization_id,
                                ":sensor": obj.brand,
                                ":organization": obj.organization,
                                ":team": obj.team
                            },
                            ProjectionExpression: "team, player_id, image_id, sensor"
                        }; */
                    } else {
						params = {org_id : org[0].organization_id ,organization : obj.organization , team :obj.team}
                      /*  params = {
                            TableName: "sensor_details",
                            KeyConditionExpression:  "org_id = :org_id",
                            FilterExpression: "organization = :organization and team = :team",
                            ExpressionAttributeValues: {
                                ":org_id": org[0].organization_id,
                                ":organization": obj.organization,
                                ":team": obj.team
                            },
                            ProjectionExpression: "team, player_id, image_id, sensor"
                        };*/
                    }
                    
				  const sensorDetails = require("../models/sensors/sensorDetailsData");		
						var item = [];
						sensorDetails.find(params, function (err, details) {
							if (err) {
								reject(err);
							}
							if (details == null) {
								resolve([]);
							} else {
								resolve(details);
							}
						}); 
                     /* var item = [];
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
                    }); */
                } else {
                    resolve([]);
                    done();
                }
            })    
    });
}

function getPlayersListFromTeamsDB(obj) {
    return new Promise((resolve, reject) => {
        let params;
        params = {
            TableName: "organizations",
            FilterExpression: "organization = :organization and team_name = :team_name",
            ExpressionAttributeValues: {
            ":organization": obj.organization,
            ":team_name": obj.team_name
            },
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

function getOrganizationData(obj) {
    return new Promise((resolve, reject) => {
        let params;

        if (obj.sensor) {
            params = {
                TableName: "organizations",
                FilterExpression: "organization = :organization and team_name = :team_name and sensor = :sensor",
                ExpressionAttributeValues: {
                    ":organization": obj.organization,
                    ":team_name": obj.team_name,
                    ":sensor": obj.sensor,
                },
            };
        } else {
            params = {
                TableName: "organizations",
                FilterExpression: "organization = :organization and team_name = :team_name",
                ExpressionAttributeValues: {
                    ":organization": obj.organization,
                    ":team_name": obj.team_name
                },
            };
        }
                
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

function storeSensorData(sensor_data_array, org_id) {
    console.log('storeSensorData ---------', sensor_data_array)
    console.log('storeSensorData 2---------', sensor_data_array[0]['simulation'])

    return new Promise((resolve, reject) => {
        var counter = 0;
        if (sensor_data_array.length == 0) {
            resolve(true);
        }
		const sensorDetails = require("../models/sensors/sensorDetailsData");
        for (var i = 0; i < sensor_data_array.length; i++) {
            sensor_data_array[i].org_id = org_id;
            if (sensor_data_array[i].level === 300) {
                delete sensor_data_array[i].sensor
            }
            /* let param = {
                TableName: "sensor_details",
                Item: sensor_data_array[i],
            }; */ 
			
			var simulation = {
				"angular-velocity":"",
				"angular-acceleration":"",
				"linear-acceleration":"",
				"mesh-transformation":"",
				"angular-velocity":"",
			}
			if(sensor_data_array[i]['angular-velocity']){
				simulation["angular-velocity"] = sensor_data_array[i]['angular-velocity'];
			}
			if(sensor_data_array[i]['angular-acceleration']){
				simulation["angular-acceleration"]= sensor_data_array[i]['angular-acceleration'];
			}
			if(sensor_data_array[i]['linear-acceleration']){
				simulation["linear-acceleration"]=sensor_data_array[i]['linear-acceleration'];
			}
			if(sensor_data_array[i]['mesh-transformation']){
				simulation["mesh-transformation"] = sensor_data_array[i]['mesh-transformation'];
			}
			if(sensor_data_array[i]['la-units']){
				simulation["la-units"] = sensor_data_array[i]['la-units'];
			}

            console.log('storeSensorData 3---------', simulation)

			var sensor = new sensorDetails(
				{
					org_id: sensor_data_array[i].org_id,
					player_id: sensor_data_array[i].player_id,
					image_id: sensor_data_array[i].image_id,
					'impact-date': sensor_data_array[i]['impact-date']?sensor_data_array[i]['impact-date']:sensor_data_array[i]['date'],
					'impact-time': sensor_data_array[i]['impact-time']?sensor_data_array[i]['impact-time']:sensor_data_array[i]['time'],
					level: sensor_data_array[i].level,
					organization: sensor_data_array[i].organization,
					player: sensor_data_array[i].player,
					simulation: simulation,
					simulation_status: sensor_data_array[i].simulation_status,
					team: sensor_data_array[i].team,
					sensor: sensor_data_array[i].sensor,
					user_cognito_id: sensor_data_array[i].user_cognito_id
				}
			);
			sensor.save(function (err) {
				if (err) {					
					reject(err);
				}
				else {
					resolve(true);
				}
			});	 
           /* docClient.put(param, function (err, data) {
                counter++;
                if (err) {
                    console.log('err storeSensorData ---------\n',err);
                    reject(err);
                }
                if (counter == sensor_data_array.length) {
                    resolve(true);
                }
            });*/
        }
    });
}

function storeSensorData_of_jsonFile(sensor_data_array, org_id) {
    console.log('storeSensorData_of_jsonFile ---------', sensor_data_array)
    console.log('storeSensorData_of_jsonFile 2---------', sensor_data_array[0]['simulation'])

    return new Promise((resolve, reject) => {
        var counter = 0;
        if (sensor_data_array.length == 0) {
            resolve(true);
        }
        const sensorDetails = require("../models/sensors/sensorDetailsData");
        for (var i = 0; i < sensor_data_array.length; i++) {
            sensor_data_array[i].org_id = org_id;
            if (sensor_data_array[i].level === 300) {
                delete sensor_data_array[i].sensor
            }
            /* let param = {
                TableName: "sensor_details",
                Item: sensor_data_array[i],
            }; */ 
            
            var simulation = {
                "la-units":"",
                "angular-to-linear-frame":"",
                "angular-velocity":"",
                "angular-acceleration":"",
                "linear-acceleration":"",
                "mesh-transformation":"",
                "angular-velocity":"",
            }
            if(sensor_data_array[i]['simulation']['angular-velocity']){
                simulation["angular-velocity"] = sensor_data_array[i]['simulation']['angular-velocity'];
            }
            if(sensor_data_array[i]['simulation']['angular-acceleration']){
                simulation["angular-acceleration"]= sensor_data_array[i]['simulation']['angular-acceleration'];
            }
            if(sensor_data_array[i]['simulation']['linear-acceleration']){
                simulation["linear-acceleration"]=sensor_data_array[i]['simulation']['linear-acceleration'];
            }
            if(sensor_data_array[i]['simulation']['mesh-transformation']){
                simulation["mesh-transformation"] = sensor_data_array[i]['simulation']['mesh-transformation'];
            }
            if(sensor_data_array[i]['simulation']['la-units']){
                simulation["la-units"] = sensor_data_array[i]['simulation']['la-units'];
            }
            if(sensor_data_array[i]['simulation']['angular-to-linear-frame']){
                simulation["angular-to-linear-frame"] = sensor_data_array[i]['simulation']['angular-to-linear-frame'];
            }


            console.log('storeSensorData_of_jsonFile 3---------', simulation)

            var sensor = new sensorDetails(
                {
                    org_id: sensor_data_array[i].org_id,
                    player_id: sensor_data_array[i].player_id,
                    image_id: sensor_data_array[i].image_id,
                    'impact-date': sensor_data_array[i]['impact-date']?sensor_data_array[i]['impact-date']:sensor_data_array[i]['date'],
                    'impact-time': sensor_data_array[i]['impact-time']?sensor_data_array[i]['impact-time']:sensor_data_array[i]['time'],
                    level: sensor_data_array[i].level,
                    organization: sensor_data_array[i].organization,
                    player: sensor_data_array[i].player,
                    simulation: simulation,
                    simulation_status: sensor_data_array[i].simulation_status,
                    team: sensor_data_array[i].team,
                    sensor: sensor_data_array[i].sensor,
                    user_cognito_id: sensor_data_array[i].user_cognito_id
                }
            );
            sensor.save(function (err) {
                if (err) {                  
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });  
           /* docClient.put(param, function (err, data) {
                counter++;
                if (err) {
                    console.log('err storeSensorData ---------\n',err);
                    reject(err);
                }
                if (counter == sensor_data_array.length) {
                    resolve(true);
                }
            });*/
        }
    });
}

function storeSensorData_v2(sensor_data_array, org_id) {
    console.log('storeSensorData_v2 ---------', org_id)
	const sensorDetails = require("../models/sensors/sensorDetailsData");
    return new Promise((resolve, reject) => {
        if(sensor_data_array) {
            sensor_data_array.org_id = org_id;
            if (sensor_data_array.level === 300) {
                delete sensor_data_array.sensor
            }
            /* let param = {
                TableName: "sensor_details",
                Item: sensor_data_array,
            };

            docClient.put(param, function (err, data) {
                if (err) {
                    console.log('err storeSensorData_v2 ---------\n',err);
                    reject(err);
                }else{
                    resolve(true);
                }
            });*/
			var simulation = {
				"angular-velocity":"",
				"angular-acceleration":"",
				"linear-acceleration":"",
				"mesh-transformation":"",
				"angular-velocity":"",
			}
			if(sensor_data_array[i]['angular-velocity']){
				simulation["angular-velocity"] = sensor_data_array[i]['angular-velocity'];
			}
			if(sensor_data_array[i]['angular-acceleration']){
				simulation["angular-acceleration"]= sensor_data_array[i]['angular-acceleration'];
			}
			if(sensor_data_array[i]['linear-acceleration']){
				simulation["linear-acceleration"]=sensor_data_array[i]['linear-acceleration'];
			}
			if(sensor_data_array[i]['mesh-transformation']){
				simulation["mesh-transformation"] = sensor_data_array[i]['mesh-transformation'];
			}
			if(sensor_data_array[i]['la-units']){
				simulation["la-units"] = sensor_data_array[i]['la-units'];
			}
			var sensor = new sensorDetails(
				{
					org_id: sensor_data_array.org_id,
					player_id: sensor_data_array.player_id,
					image_id: sensor_data_array.image_id,
					'impact-date': sensor_data_array['impact-date']?sensor_data_array['impact-date']:sensor_data_array['date'],
					'impact-time': sensor_data_array['impact-time']?sensor_data_array['impact-time']:sensor_data_array['time'],
					level: sensor_data_array.level,
					organization: sensor_data_array.organization,
					player: sensor_data_array.player,
					simulation: simulation,
					simulation_status: sensor_data_array.simulation_status,
					team: sensor_data_array.team,
					sensor: sensor_data_array.sensor,
					user_cognito_id: sensor_data_array.user_cognito_id
				}
			);
			console.log("sensor",sensor)
			sensor.save(function (err) {
				if (err) {					
					reject(err);
				}
				else {
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

function addPlayerToTeamOfOrganization(sensor, user_cognito_id, org, team, player_id) {
    return new Promise((resolve, reject) => {
        let params;
        if (sensor && sensor != null && sensor != undefined) {
            params = {
                TableName: "organizations",
                FilterExpression: "organization = :organization and sensor = :sensor and team_name = :team",
                ExpressionAttributeValues: {
                    ":sensor": sensor,
                    ":organization": org,
                    ":team": team,
                }
            };
        } else {
            params = {
                TableName: "organizations",
                FilterExpression: "organization = :organization and team_name = :team",
                ExpressionAttributeValues: {
                    ":organization": org,
                    ":team": team,
                }
            };
        }
        
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
           
            if (data == null) {
                const scanData = concatArrays(item);
                if (scanData.length > 0) {
                    // If Player does not exists in Team
                    if (scanData[0].player_list) {
                        if (scanData[0].player_list.indexOf(player_id) <= -1) {
                            const dbUpdate = {
                                TableName: "organizations",
                                Key: {
                                    organization_id: scanData[0].organization_id
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
    
                            docClient.update(dbUpdate, function (err, data) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(scanData[0].organization_id);
                                }
                            });
                        } else {
                            console.log("PLAYER ALREADY EXISTS IN TEAM");
                            resolve(scanData[0].organization_id);
                        }
                    } else {
                        const dbInsert = {
                            TableName: "organizations",
                            Item: {
                                organization_id: scanData[0].organization_id,
                                sensor: sensor,
                                user_cognito_id: user_cognito_id,
                                organization: org,
                                team_name: team,
                                player_list: [player_id]
                            },
                        };
                        docClient.put(dbInsert, function (err, data) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            } else {
                                resolve(scanData[0].organization_id);
                            }
                        });
                    }
                } else {
                    const org_id = 'org-' + Date.now();
                    const dbInsert = {
                        TableName: "organizations",
                        Item: {
                            organization_id: org_id,
                            sensor: sensor,
                            user_cognito_id: user_cognito_id,
                            organization: org,
                            team_name: team,
                            player_list: [player_id],
                            entityID: 'EID'+ Date.now()
                        },
                    };
                    docClient.put(dbInsert, function (err, data) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        } else {
                            resolve(org_id);
                        }
                    });
                }
                //resolve(concatArrays(item));
            } else {
                item.push(data.Items);
            }
            done();
        }); 
    });
}

function removeA(arr) {
    var what, a = arguments, L = a.length, ax;
    while (L > 1 && arr.length) {
        what = a[--L];
        while ((ax= arr.indexOf(what)) !== -1) {
            arr.splice(ax, 1);
        }
    }
    return arr;
}

function removeRequestedPlayerFromOrganizationTeam(org, team, player_id) {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: "organizations",
            FilterExpression: "organization = :organization and team_name = :team",
            ExpressionAttributeValues: {
                ":organization": org,
                ":team": team,
            }
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
           
            if (data == null) {
                const scanData = concatArrays(item);
                if (scanData.length > 0) {
                    // If Player does not exists in Team
                    if (scanData[0].requested_player_list && scanData[0].requested_player_list.indexOf(player_id) <= -1) {
                        resolve(null);
                    } else {
                        if (scanData[0].requested_player_list) {
                            let updatedList = scanData[0].requested_player_list;
                            updatedList = removeA(updatedList, player_id);
                            const dbUpdate = {
                                TableName: "organizations",
                                Key: {
                                    organization_id: scanData[0].organization_id
                                },
                                UpdateExpression: "set #list = :newItem ",
                                ExpressionAttributeNames: {
                                    "#list": "requested_player_list",
                                },
                                ExpressionAttributeValues: {
                                    ":newItem": updatedList,
                                },
                                ReturnValues: "UPDATED_NEW",
                            };

                            docClient.update(dbUpdate, function (err, data) {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(data);
                                }
                            });
                        } else {
                            resolve(null);
                        }
                    }
                } else {
                }
            } else {
                item.push(data.Items);
            }
            done();
        }); 
    });
}

function checkIfSelfiePresent(player_id) {
    return new Promise((resolve, reject) => {
        //Fetch user details from dynamodb
        let params = {
            TableName: "users",
            Key: {
                "user_cognito_id": player_id
            }
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            }
            else {
                console.log("check if selfie present ", data);
                if ((Object.keys(data).length == 0 && data.constructor === Object)) {
                    addPlayerToUsers(player_id)
                        .then(data => {
                            resolve(false);
                        })
                        .catch(err => {
                            reject(err);
                        })
                }
                else if (('is_selfie_image_uploaded' in data.Item && data.Item.is_selfie_image_uploaded == false) || (!data.Item.is_selfie_image_uploaded)) {
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            }
        });

    })
}

function addPlayerToUsers(user_id) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "users",
            Item: {
                user_cognito_id: user_id,
                is_selfie_image_uploaded: false
            }
        }
        docClient.put(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })

    })
}

function updateSelfieAndModelStatusInDB(obj) {
    return new Promise((resolve, reject) => {
        fetchCGValues(obj.user_cognito_id)
            .then(playerDetail => {
                if (playerDetail.length > 0) {
                    const user_cognito_id = playerDetail[0].user_cognito_id;

                    var userParams = {
                        TableName: "users",
                        Key: {
                            "user_cognito_id": user_cognito_id
                        },
                        UpdateExpression: "set is_selfie_image_uploaded = :selfie_image_uploaded, is_selfie_model_uploaded = :selfie_model_uploaded",
                        ExpressionAttributeValues: {
                            ":selfie_model_uploaded": true,
                            ":selfie_image_uploaded": true,
                        },
                        ReturnValues: "UPDATED_NEW"
                    };
                    docClient.update(userParams, (err, data) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(data);
                        }
                    })
                } else {
                    reject('Player does not exists.');
                }
            })
        });
}

function updateSimulationImageToDDB(
    image_id,
    bucket_name,
    path,
    status = "completed",
    token = null,
    secret = null,
    account_id,
    mesh = "coarse",
    admin_detail,
    impact_video_path
) {
    console.log('impact_video_path -----------------',impact_video_path)
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
                                account_id: account_id,
                                mesh: mesh,
                                admin_detail: admin_detail,
                                impact_video_path: impact_video_path

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
                            UpdateExpression: "set #path = :path,#status = :status, #mesh = :mesh",
                            ExpressionAttributeNames: {
                                "#path": "path",
                                "#status": "status",
                                "#mesh": 'mesh'
                            },
                            ExpressionAttributeValues: {
                                ":path": path,
                                ":status": status,
                                ":mesh": mesh
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

function updateSimulationData(obj, cb) {
    var userParams = {
        TableName: "simulation_images",
        Key: {
            image_id: obj.image_id,
        },
        UpdateExpression:
            "set job_id = :job_id",
        ExpressionAttributeValues: {
            ":job_id": obj.job_id,
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

function getCompletedJobs() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            FilterExpression:
                "#job_status = :job_status_value and attribute_exists(job_id) and attribute_not_exists(computed_time)",
            ExpressionAttributeValues: {
                ":job_status_value": "completed",
            },
            ExpressionAttributeNames: {
                "#job_status": "status",
            },
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                // console.log(data.Items);
                item.push(data.Items);
            }
            done();
        });
    });
}

function getFialedBrainSummaryImgagesJob() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            FilterExpression:
                "#getSummary_status = :getSummary_status",
            ExpressionAttributeValues: {
                ":getSummary_status": "Failure",
            },
            ExpressionAttributeNames: {
                "#getSummary_status": "getSummary_status",
            },
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                // console.log(data.Items);
                item.push(data.Items);
            }
            done();
        });
    });
}

function getFialedBrainSingleEventImgagesJob() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            FilterExpression:
                "#GetSingleEvent_status = :GetSingleEvent_status",
            ExpressionAttributeValues: {
                ":GetSingleEvent_status": "Failure",
            },
            ExpressionAttributeNames: {
                "#GetSingleEvent_status": "GetSingleEvent_status",
            },
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                // console.log(data.Items);
                item.push(data.Items);
            }
            done();
        });
    });
}


function getFialedBrainLabeledImgagesJob() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            FilterExpression:
                "#GetLabeledImage_status = :GetLabeledImage_status",
            ExpressionAttributeValues: {
                ":GetLabeledImage_status": "Failure",
            },
            ExpressionAttributeNames: {
                "#GetLabeledImage_status": "GetLabeledImage_status",
            },
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                // console.log(data.Items);
                item.push(data.Items);
            }
            done();
        });
    });
}


function updateJobComputedTime(obj, cb) {
    var userParams = {
        TableName: "simulation_images",
        Key: {
            image_id: obj.image_id,
        },
        UpdateExpression:
            "set computed_time = :computed_time, log_stream_name = :log_stream_name",
        ExpressionAttributeValues: {
            ":computed_time": obj.computed_time,
            ":log_stream_name": obj.log_stream_name,
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

function updateJobImageGenerateStatus(obj, cb) {
    console.log('updateJobImageGenerateStatus', obj.image_id)
    var userParams = {
        TableName: "simulation_images",
        Key: {
            image_id: obj.image_id,
        },
        UpdateExpression:
            "set #simulation_images_type = :simulation_images_status",
        ExpressionAttributeValues: {
            ":simulation_images_status": obj.simulation_images_status,
        },
        ExpressionAttributeNames: {
            "#simulation_images_type": obj.type,
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

function getJobs() {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            FilterExpression: "attribute_exists(job_id) and attribute_not_exists(log_stream_name)"
        };
        var item = [];
        docClient.scan(params).eachPage((err, data, done) => {
            if (err) {
                reject(err);
            }
            if (data == null) {
                resolve(concatArrays(item));
            } else {
                // console.log(data.Items);
                item.push(data.Items);
            }
            done();
        });
    });
}

function updateJobLogStreamName(obj, cb) {
    var userParams = {
        TableName: "simulation_images",
        Key: {
            image_id: obj.image_id,
        },
        UpdateExpression:
            "set log_stream_name = :log_stream_name",
        ExpressionAttributeValues: {
            ":log_stream_name": obj.log_stream_name,
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



function fetchCGValues(account_id) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "users",
            FilterExpression: "account_id = :account_id",
            ExpressionAttributeValues: {
                ":account_id": account_id
            }
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

function getUserByPlayerId(player_id) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "users",
            FilterExpression: "player_id = :player_id",
            ExpressionAttributeValues: {
                ":player_id": player_id
            }
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

function uploadCGValuesAndSetINPStatus(user_cognito_id, file_name) {
    return new Promise((resolve, reject) => {
        fs.readFile(`${rootPath}/users_data/${user_cognito_id}/morphed_vtk/${file_name}_cg.txt`, "utf8", function (err, data) {
            if (err) {
                reject(err)
            }
            else {
                fetchCGValues(user_cognito_id)
                    .then(playerDetail => {
                        if (playerDetail.length > 0) {
                            const user_cognito_id = playerDetail[0].user_cognito_id;
                            var userParams = {
                                TableName: "users",
                                Key: {
                                    "user_cognito_id": user_cognito_id
                                },
                                UpdateExpression: "set cg_coordinates = :cg, is_cg_present = :present, is_selfie_inp_uploaded = :is_selfie_inp_uploaded",
                                ExpressionAttributeValues: {
                                    ":cg": data.split(" ").map(function (x) { return parseFloat(x) }),
                                    ":present": true,
                                    ":is_selfie_inp_uploaded": true
                                },
                                ReturnValues: "UPDATED_NEW"
                            };
                            docClient.update(userParams, (err, data) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(data);
                                }
                            })
                        } else {
                            reject('Player does not exists.');
                        }
                    })
            }
        })
    });
}

function checkSensorDataExists(obj) {
    console.log(obj);
    return new Promise((resolve, reject) => {
		 let params = {"player.impact-id" : obj['impact-id'],"player.sensor-id" : obj['sensor-id']}
       /* let params = {
            TableName: "sensor_details",
            FilterExpression: "player.#impact_id = :impact_id and player.#sensor_id = :sensor_id",
            ExpressionAttributeValues: {
                ":impact_id": obj['impact-id'],
                ":sensor_id": obj['sensor-id']
            },
            ExpressionAttributeNames: {
                "#impact_id": "impact-id",
                "#sensor_id": "sensor-id",
            },
            ProjectionExpression: "org_id, image_id, team, player_id, organization"
        };*/
		
		const sensorDetails = require("../models/sensors/sensorDetailsData");		
		var item = [];
		sensorDetails.find(params, function (err, details) {
			if (err) {
				reject(err);
			}
			if (details == null) {
				resolve([]);
			} else {
				resolve(details);
			}
		}); 
       /* var item = [];
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
        });*/
    })
}

function getPlayerSimulationFile(obj) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "simulation_images",
            Key: {
                image_id: obj.image_id,
            },
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data.Item);
            }
        });
    });
}
function getSensorAdmins(sensor) {
    return new Promise((resolve, reject) => {
        let params = {
            TableName: "sensors",
            Key: {
                sensor: sensor,
            },
        };
        docClient.get(params, function (err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data.Item);
            }
        });
    });
}

function getUsersWthNoAccountId() {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: "users",
            FilterExpression: "attribute_exists(first_name) and attribute_not_exists(account_id)"
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

function updateJobStatus(key){
    console.log('key',key);
    return new Promise((resolve, reject)=>{
        var userParams = {
            TableName: "jobs_log",
            Key: {
                "created": key
            },
            UpdateExpression: "set #log_status = :log_status",
            ExpressionAttributeValues: {
                ":log_status": 'completed'
            },
            ExpressionAttributeNames : {
                '#log_status': 'status',
            },
            ReturnValues: "UPDATED_NEW"
        };
        docClient.update(userParams, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        })
    })
 
}

function getPendingJobsLog() {
    return new Promise((resolve, reject) => {
        let params;
       
        params = {
            TableName: "jobs_log",
            FilterExpression: "attribute_exists(#log_status) and #log_status = :log_status ",
            ExpressionAttributeValues: {
                ":log_status": 'pending'
            },
            ExpressionAttributeNames : {
                '#log_status': 'status',
            }
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

module.exports = {
    getUserDetails,
    getUserDetailBySensorId,
    updateSimulationFileStatusInDB,
    getTeamDataWithPlayerRecords,
    getTeamData,
    getPlayersListFromTeamsDB,
    storeSensorData,
    addPlayerToTeamInDDB,
    checkIfSelfiePresent,
    updateSelfieAndModelStatusInDB,
    updateSimulationImageToDDB,
    updateSimulationData,
    getCompletedJobs,
    updateJobComputedTime,
    fetchCGValues,
    uploadCGValuesAndSetINPStatus,
    addPlayerToTeamOfOrganization,
    getPlayerSimulationFile,
    getSensorAdmins,
    removeRequestedPlayerFromOrganizationTeam,
    getUserByPlayerId,
    addPlayer,
    getJobs,
    updateJobLogStreamName,
    checkSensorDataExists,
    getUserDetailByPlayerId,
    getOrganizationData,
    getUsersWthNoAccountId,
    updateJobImageGenerateStatus,
    getPendingJobsLog,
    updateJobStatus,
    getFialedBrainSummaryImgagesJob,
    storeSensorData_v2,
    getFialedBrainSingleEventImgagesJob,
    getFialedBrainLabeledImgagesJob,
    storeSensorData_of_jsonFile
};
