const express = require("express");

const mysql = require("mysql2/promise");
const db = mysql.createPool({
    host: "localhost",
    user: "root", /*
    password: "2004",*/
    database: "Marketflow"

});

console.log("Database connected successfully");

module.exports = db;