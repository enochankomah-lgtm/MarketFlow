const express = require("express");
const hbs = require("hbs");
const path = require("path");
const app = express();
const db = require("./Database/db");
const bcrypt = require("bcrypt");
const session = require("express-session");

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

//SESSION MUST COME FIRST
app.use(session({
    secret: "marketflow_secret_key",
    resave: false,
    saveUninitialized: false
}));

app.set("view engine", "hbs");

// Routes (AFTER session)
app.use("/", require("./routes/pages"));
app.use("/auth", require("./routes/auth"));
app.use("/productpages", require("./routes/productpages"));

const publicDirectory = path.join(__dirname, "./public");
app.use(express.static(publicDirectory));

app.listen(3000, () => {
    console.log("server started at port 3000");
});