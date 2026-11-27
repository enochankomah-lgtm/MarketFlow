
"use strict";

const mysql = require("mysql2/promise");
require("dotenv").config();

// ================================================================
// DATABASE CONFIGURATION
// ================================================================

const dbConfig = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "main",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,

    // Enzonic requires SSL/TLS
    ssl: process.env.DB_SSL === "true" ? {} : undefined
};

// ================================================================
// VALIDATE DATABASE SETTINGS
// ================================================================

if (!dbConfig.password) {
    console.error("DATABASE ERROR: DB_PASSWORD is missing!");
}

console.log("DATABASE CONFIGURATION:");
console.log("Host:", dbConfig.host);
console.log("Port:", dbConfig.port);
console.log("User:", dbConfig.user);
console.log("Database:", dbConfig.database);
console.log("SSL Enabled:", process.env.DB_SSL === "true");

// ================================================================
// CREATE DATABASE POOL
// ================================================================

const db = mysql.createPool(dbConfig);

// ================================================================
// TEST DATABASE CONNECTION
// ================================================================

(async () => {

    let connection;

    try {

        connection = await db.getConnection();

        await connection.ping();

        console.log("==================================");
        console.log("DATABASE CONNECTED SUCCESSFULLY!");
        console.log("MarketFlow is connected to Enzonic.");
        console.log("==================================");

    } catch (error) {

        console.error("==================================");
        console.error("DATABASE CONNECTION FAILED!");
        console.error("Error Code:", error.code);
        console.error("Error Message:", error.message);
        console.error("==================================");

    } finally {

        if (connection) {
            connection.release();
        }

    }

})();

module.exports = db;
