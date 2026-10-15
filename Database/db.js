const mysql = require("mysql2/promise");
require("dotenv").config();

const db = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "Marketflow",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

(async () => {
    try {
        const connection = await db.getConnection();

        console.log("Database connected successfully");

        connection.release();
    } catch (error) {
        console.error("Database connection failed:", error.message);
    }
})();

module.exports = db;