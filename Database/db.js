
"use strict";

const mysql = require("mysql2/promise");

require("dotenv").config();

// ================================================================
// DATABASE POOL SETTINGS
// ================================================================

const poolOptions = {
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

let db;

// ================================================================
// ENZONIC PRODUCTION DATABASE
// ================================================================

if (process.env.DATABASE_URL) {

    const databaseUrl = new URL(process.env.DATABASE_URL);

    const databaseName = decodeURIComponent(
        databaseUrl.pathname.replace(/^\/+/, "")
    );

    db = mysql.createPool({

        host: databaseUrl.hostname,

        port: Number(databaseUrl.port),

        user: decodeURIComponent(databaseUrl.username),

        password: decodeURIComponent(databaseUrl.password),

        database: databaseName,

        // Enzonic requires TLS.
        // Certificate verification remains enabled.
        ssl: {},

        ...poolOptions
    });

    console.log("Using Enzonic DATABASE_URL connection.");

}

// ================================================================
// LOCAL DEVELOPMENT DATABASE
// ================================================================

else {

    db = mysql.createPool({

        host: process.env.DB_HOST || "localhost",

        port: Number(process.env.DB_PORT || 3306),

        user: process.env.DB_USER || "root",

        password: process.env.DB_PASSWORD,

        database: process.env.DB_NAME || "main",

        ssl: process.env.DB_SSL === "true"
            ? {}
            : undefined,

        ...poolOptions
    });

    console.log("Using local database configuration.");

}

// ================================================================
// DATABASE CONNECTION TEST
// ================================================================

(async () => {

    let connection;

    try {

        connection = await db.getConnection();

        await connection.ping();

        console.log("Database connected successfully!");

    } catch (error) {

        console.error(
            "Database connection failed:",
            error.code || error.message
        );

    } finally {

        if (connection) {
            connection.release();
        }

    }

})();

module.exports = db;
