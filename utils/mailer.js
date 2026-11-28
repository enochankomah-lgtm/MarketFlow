
"use strict";

const RESEND_API_URL = "https://api.resend.com/emails";

const API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

const emailConfigured = Boolean(API_KEY && EMAIL_FROM);


async function verifyEmailConnection() {

    if (!emailConfigured) {

        console.error(
            "MarketFlow email configuration is incomplete."
        );

        if (!API_KEY) {
            console.error("Missing RESEND_API_KEY.");
        }

        if (!EMAIL_FROM) {
            console.error("Missing EMAIL_FROM.");
        }

        return false;
    }

    console.log("----------------------------------");
    console.log("MARKETFLOW EMAIL CONFIGURATION");
    console.log("Provider: Resend API");
    console.log("Sender:", EMAIL_FROM);
    console.log("Transport: HTTPS");
    console.log("Configuration: Ready");
    console.log("----------------------------------");

    return true;
}
async function sendEmail({ to, subject, html, text }) {

    if (!emailConfigured) {
        throw new Error(
            "Resend email service is not configured."
        );
    }

    if (!to || !subject || (!html && !text)) {
        throw new Error(
            "Recipient, subject and email content are required."
        );
    }

    try {

        const response = await fetch(RESEND_API_URL, {

            method: "POST",

            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                from: EMAIL_FROM,

                to: Array.isArray(to) ? to : [to],

                subject,

                ...(html ? { html } : {}),

                ...(text ? { text } : {})

            }),

            signal: AbortSignal.timeout(20000)

        });

        const result = await response.json();

        if (!response.ok) {

            const errorMessage =
                result.message ||
                result.error ||
                "Email delivery failed.";

            console.error(
                "Resend API error:",
                response.status,
                errorMessage
            );

            throw new Error(
                `Resend API error (${response.status}): ${errorMessage}`
            );
        }

        console.log(
            "MarketFlow email sent successfully!",
            result.id
        );

        // Maintain compatibility with existing callers.
        return {
            ...result,
            messageId: result.id
        };

    } catch (error) {

        console.error(
            "MarketFlow email delivery failed:",
            error.message
        );

        throw error;
    }
}

// ======================================================
// EXPORTS
// ======================================================

module.exports = {
    verifyEmailConnection,
    sendEmail
};
