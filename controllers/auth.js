const express = require("express");
const mysql = require("mysql2/promise");
const db = require("../Database/db");

const bcrypt = require("bcrypt");

console.log("Everyting connected successfully ");


exports.register = async(req, res) => {

    const { firstName, lastName, email, jobTitle, role, phone, businessName, location, password, confirmPassword } = req.body;
    if (!firstName || !lastName || !email || !jobTitle || !role || !phone || !businessName || !location || !password || !confirmPassword) {
        return res.render("Account", {
            message: "Please fill all the information provided",
            email
        });
    }
    if (password !== confirmPassword) {
        return res.render("Account", {
            message: "please the password does't match",
            email
        })
    }
    try {

        const [exist] = await db.query("select UserID, FirstName, LastName, Email from Users where Email=?", [email])
        if (exist.length > 0) {
            return res.render("Account", {
                message: "please is Email exist already",
                email
            })
        }

        

        const encrptpassword = await bcrypt.hash(password, 10);

        console.log(encrptpassword);

        const [result] = await db.query(
            "insert into Users(FirstName, LastName, JobTitle,RoleName, Business_name, Business_location, Email, Phone, PasswordHash) values(?,?,?,?,?,?,?,?,?)",
            [firstName, lastName, jobTitle, role, businessName, location, email, phone, encrptpassword]
        );
        console.log("successful")
        
        req.session.user = {
            id: result.insertId,
            name: firstName + " " + lastName,
            email: email,
            RoleName: role,
            Business_name:businessName,
            phone:phone,
            location:location
        };

        return res.redirect("/productpages/main");
        
    } catch (error) {
        console.log(error);
        res.render("Account", {
            message: "Error occur consult admin"
        })
    }
}

exports.login = async(req, res) => {

    const { email, password } = req.body;

    try {

        const [users] = await db.query(
            `SELECT *
             FROM Users
             WHERE Email = ?`, [email]
        );

        if (users.length === 0) {
            return res.render("login", {
                message: "This email does not exist",
                email
            });
        }

        const user = users[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.PasswordHash
        );

        if (!passwordMatch) {
            return res.render("login", {
                message: "Incorrect password",
                email
            });
        }

        
        req.session.user = {
            id: user.UserID,
            name: user.FirstName + " " + user.LastName,
            email: user.Email,
            location:user.Business_location,
            phone:user.Phone,
            RoleName:user.RoleName,
            Business_name:user.Business_name
        };
        console.log(req.session.user);
        return res.redirect("/productpages/main");

    } catch (error) {

        console.log(error);

        return res.render("login", {
            message: "Problem while connecting. Please contact the administrator."
        });

    }
};


exports.logout = (req, res) => {

    req.session.destroy((err) => {

        if (err) {
            console.log(err);
            return res.status(500).send("Unable to log out.");
        }

        res.clearCookie("connect.sid");

        return res.redirect('/login');

    });

};