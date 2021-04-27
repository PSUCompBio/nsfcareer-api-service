var mongoose = require('mongoose');
var Schema = mongoose.Schema;
//brands Schema
var usersDataSchema = new Schema({
    user_cognito_id: {
        type: String,
        required: true
    },
    account_id: {
        type: String,
        required: true
    },
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    gender: {
        type: String
    },
    country: {
        type: String
    },
    country_code: {
        type: String
    },
    phone_number: {
        type: String
    },
    email: {
        type: String,
        required: true
    },
    dob: {
        type: String,
        required: true
    },
    level: {
        type: Number,
        required: true
    },
    status: {
        type: Number,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now()
    },
    updated_at: {
        type: Date,
        default: Date.now()
    },
    is_cg_present: {
        type: String
    },
    is_selfie_image_uploaded: {
        type: String
    },
    is_selfie_inp_uploaded:
    {
        type: String
    },
    is_selfie_model_uploaded: {
        type: String
    },
    is_selfie_simulation_file_uploaded: {
        type: String
    },
    user_secret: {
        type: String,
        required: true
    },
    password: {
        type: String,
    },
    user_signature: {
        type: String,
        required: true
    },
    user_facebook_ID: {
        type: String,
    },
    user_google_ID: {
        type: String,
    },
    number_verified_code: {
        type: String
    },
    number_verified_code_exp: {
        type: String
    },
    verified_number: {
        type: Number,
    },
    verified_mail: {
        type: Number,
    },
    selfie_image_uploaded: {
        type: Number,
    },
    permission_research_purposes: {
        type: Number,
        default: 1
    },
    permission_share_data: {
        type: Number
    },
    sensor_brand: {
        type: Schema.Types.ObjectId,
        ref: 'sensors'
    },
    sensor_id: {
        type: String
    },
    sport: {
        type: String
    },
    position: {
        type: String
    },
    rbf_status: {
        type: String
    },
});
var collectionName = 'users'
module.exports = mongoose.model('users', usersDataSchema, collectionName);