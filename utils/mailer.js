
"use strict";

const nodemailer = require("nodemailer");

const emailConfigured =
    process.env.EMAIL_HOST &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS;

let transporter = null;

if (emailConfigured) {
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT || 465),
        secure: process.env.EMAIL_SECURE === "true",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
}

// Verify Gmail connection
async function verifyEmailConnection() {
    if (!transporter) {
        console.warn("MarketFlow email settings are incomplete.");
        return false;
    }

    try {
        await transporter.verify();

        console.log("MarketFlow Gmail connection successful!");

        return true;
    } catch (error) {
        console.error(
            "MarketFlow Gmail connection failed:",
            error.message
        );

        return false;
    }
}

// Reusable email sender
async function sendEmail({ to, subject, html, text }) {
    if (!transporter) {
        throw new Error("Email service is not configured.");
    }

    if (!to || !subject || (!html && !text)) {
        throw new Error(
            "Recipient, subject and email content are required."
        );
    }

    return transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject,
        html,
        text
    });
}

module.exports = {
    verifyEmailConnection,
    sendEmail
};
