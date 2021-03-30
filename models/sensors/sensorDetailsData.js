var mongoose = require('mongoose');
var Schema = mongoose.Schema;
//brands Schema
var sensorDetailsDataSchema = new Schema({
    org_id : {
        type: String,
        required: false
    },
    player_id : {
        type: String,
        required: false
    },
    image_id  : {
        type: String,
        required: false
    },
    'impact-date' : {
        type: String,
        required: false
    },
    'impact-time' : {
        type: String,
        required: false
    },
    level : {
        type: Number,
        required: false
    },
    organization : {
        type: String,
        required: false
    },
    player : {
        type: Object,
        required: false
    },
    simulation : {
       type: Object,
        required: false
    },
    simulation_status : {
        type: String,
        required: false
    },
    team : {
        type: String,
        required: false
    },
    sensor : {
       type: String,
        required: false
    },
    user_cognito_id : {
        type: String,
        required: false
    },
});
var collectionName = 'sensor_details'
module.exports = mongoose.model('sensor_details', sensorDetailsDataSchema, collectionName);