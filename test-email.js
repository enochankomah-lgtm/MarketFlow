
"use strict";

require("dotenv").config({ path: "./.env" });

const {
    sendEmail,
    verifyEmailConnection
} = require("./utils/mailer");

async function testEmail() {

    try {

        console.log(
            "Testing MarketFlow Resend configuration..."
        );

        const configured = await verifyEmailConnection();

        if (!configured) {
            throw new Error(
                "Email configuration is incomplete."
            );
        }

        const result = await sendEmail({

            // Must be a verified recipient during initial testing.
            to: process.env.EMAIL_USER,

            subject: "MarketFlow - Email Configuration Test",

            text: `
Congratulations!

MarketFlow can now send emails successfully.

Your email delivery system is working.
            `,

            html: `
                <div style="
                    font-family:Arial,sans-serif;
                    padding:25px;
                    color:#1f2937;
                ">

                    <h2 style="color:#166534;">
                        Welcome to MarketFlow!
                    </h2>

                    <p>
                        Your email delivery system is working successfully.
                    </p>

                    <p>
                        MarketFlow can now send account invitations,
                        password-reset links and notifications.
                    </p>

                    <hr>

                    <p style="
                        color:#64748b;
                        font-size:12px;
                    ">
                        This is an automated test email from MarketFlow.
                    </p>

                </div>
            `

        });

        console.log("----------------------------------");
        console.log("TEST EMAIL SENT SUCCESSFULLY!");
        console.log("Message ID:", result.messageId);
        console.log("----------------------------------");

    } catch (error) {

        console.error(
            "TEST EMAIL FAILED:",
            error.message
        );

        process.exitCode = 1;
    }
}

testEmail();
