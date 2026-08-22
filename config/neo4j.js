const neo4j = require('neo4j-driver');
require('dotenv').config();

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER;
const password = process.env.NEO4J_PASSWORD;
const databaseName = process.env.NEO4J_DATABASE || 'neo4j';
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

function getNeo4jSession() {
    return driver.session({ database: databaseName });
}

module.exports = { getNeo4jSession, driver };