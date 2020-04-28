# rbf-brain-nodejs-service
A lightweight service to generate INP (FE Mesh) data and upload it on AWS data lake.
### Initialization & Dependencies configuration:
- #### Install all the required dependencies by executing following commands :
- ##### Pre-Requisites
    - A Debian based Linux System (Ubuntu)
    - Nodejs (min version >= 8.X)
```
# If on linux : sudo is required with -g based npm commands (They are global dependencies being installed in System)
# NOTE : No sudo is required in docker for commands given below
# Linux 'zip' utility needs to be installed

# To deploy nodejs service for production
$ sudo npm install -g forever

# To install Project's dependencies
$ npm install
```

### To Run Application Locally : 
#### Step 0 : Install Dependencies by following above steps.
#### Step 1 : Update config file in config/configuration_keys.json
  - ###### Add AWS Access Key ID and AWS Secret Access Key ID and AWS Buckets name in configuration_keys.json.
  - To do this, In AWS Management Console, Search and open IAM service, Then Select Users from Left-hand Side Pane. Select your user-name listed in Table. Then click on Security Credentials Tab, there you can access & view your all AWS Access Key IDs. If the user does not have a user account, then create one.
  - ###### Add AWS Avatar SDK Access Key ID and Secret Access Key ID and AWS Buckets name in configuration_keys.json.
#### Step 3 : Run Application :
```
# To run application normally 
$ npm start

# To run application in production mode 
$ forever start server.js
```
#### Step 4 : Access application on URL -> http://localhost:3000/ in your browser..

### Major Dependencies

| Dependency  | README |
| ------ | ------ |
| NodeJS | https://nodejs.org/|
