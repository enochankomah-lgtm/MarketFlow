
"use strict";

const db = require("../Database/db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { sendEmail } = require("../utils/mailer");

// ================================================================
// CONFIGURATION
// ================================================================

const TOKEN_EXPIRY_MINUTES = 30;
const PASSWORD_MIN_LENGTH = 8;

const GENERIC_RESPONSE =
    "If an active account exists with that email address, " +
    "a password reset link will be sent. Please check your inbox and spam folder.";

// ================================================================
// SECURITY HELPERS
// ================================================================

function setSecurityHeaders(res) {
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function isValidToken(token) {
    return typeof token === "string" &&
        /^[a-f0-9]{64}$/i.test(token);
}

function getResetUrl(token) {
    if (!process.env.APP_BASE_URL) {
        throw new Error("APP_BASE_URL is not configured.");
    }

    const baseUrl = new URL(process.env.APP_BASE_URL);

    const isLocalHttp =
        baseUrl.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(baseUrl.hostname);

    if (baseUrl.protocol !== "https:" && !isLocalHttp) {
        throw new Error("APP_BASE_URL must use HTTPS outside localhost.");
    }

    const resetUrl = new URL("/auth/reset-password", baseUrl);

    resetUrl.searchParams.set("token", token);

    return resetUrl.toString();
}

// ================================================================
// CREATE PASSWORD RESET TOKEN
// ================================================================

async function createPasswordResetToken(user) {

    const rawToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = hashToken(rawToken);

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Invalidate previous unused reset tokens.
        await connection.query(
            `UPDATE password_reset_tokens
             SET used_at = UTC_TIMESTAMP()
             WHERE user_id = ?
             AND used_at IS NULL`,
            [user.UserID]
        );

        // Store only the SHA-256 hash.
        await connection.query(
            `INSERT INTO password_reset_tokens
             (user_id, business_id, token_hash, expires_at)
             VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))`,
            [
                user.UserID,
                user.business_id,
                tokenHash,
                TOKEN_EXPIRY_MINUTES
            ]
        );

        await connection.commit();

        return {
            rawToken,
            tokenHash
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
}

// ================================================================
// FORGOT PASSWORD PAGE
// ================================================================

exports.showForgotPasswordPage = (req, res) => {

    setSecurityHeaders(res);

    return res.render("forgotPassword", {
        title: "Forgot Password"
    });
};

// ================================================================
// REQUEST PASSWORD RESET
// ================================================================

exports.requestPasswordReset = async (req, res) => {

    setSecurityHeaders(res);

    const email =
        typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";

    try {

        if (email && email.length <= 100) {

            const [users] = await db.query(
                `SELECT UserID, business_id, FirstName, Email
                 FROM users
                 WHERE Email = ?
                 AND IsActive = 1
                 LIMIT 1`,
                [email]
            );

            if (users.length > 0) {

                const user = users[0];

                const tokenData =
                    await createPasswordResetToken(user);

                const resetUrl =
                    getResetUrl(tokenData.rawToken);

                try {

                    await sendEmail({
                        to: user.Email,

                        subject: "Reset Your MarketFlow Password",

                        text:
                            `Hello ${user.FirstName},\n\n` +
                            `We received a request to reset your MarketFlow password.\n\n` +
                            `Use this link to reset your password:\n${resetUrl}\n\n` +
                            `This link expires in ${TOKEN_EXPIRY_MINUTES} minutes.\n\n` +
                            `If you did not request this, you can ignore this email.`,

                        html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="UTF-8">
                                <meta name="viewport"
                                      content="width=device-width, initial-scale=1.0">
                            </head>

                            <body style="
                                margin:0;
                                padding:30px 15px;
                                background:#f4f7fb;
                                font-family:Arial,sans-serif;
                                color:#1f2937;
                            ">

                                <div style="
                                    max-width:520px;
                                    margin:auto;
                                    background:white;
                                    padding:35px;
                                    border-radius:12px;
                                ">

                                    <h2 style="
                                        color:#166534;
                                        margin-top:0;
                                    ">
                                        MarketFlow
                                    </h2>

                                    <h3>Password Reset Request</h3>

                                    <p>
                                        Hello ${escapeHtml(user.FirstName)},
                                    </p>

                                    <p>
                                        We received a request to reset
                                        your MarketFlow account password.
                                    </p>

                                    <p>
                                        Click the button below to choose
                                        a new password.
                                    </p>

                                    <div style="text-align:center;margin:30px 0;">

                                        <a href="${escapeHtml(resetUrl)}"
                                           style="
                                               display:inline-block;
                                               padding:14px 25px;
                                               background:#166534;
                                               color:white;
                                               text-decoration:none;
                                               border-radius:7px;
                                               font-weight:bold;
                                           ">
                                            Reset My Password
                                        </a>

                                    </div>

                                    <p>
                                        This link expires in
                                        <strong>${TOKEN_EXPIRY_MINUTES} minutes</strong>.
                                    </p>

                                    <p>
                                        If you did not request a password
                                        reset, you can safely ignore this email.
                                    </p>

                                    <hr style="
                                        border:0;
                                        border-top:1px solid #e5e7eb;
                                        margin-top:30px;
                                    ">

                                    <p style="
                                        color:#64748b;
                                        font-size:12px;
                                    ">
                                        This is an automated email from MarketFlow.
                                        Please do not reply.
                                    </p>

                                </div>

                            </body>
                            </html>
                        `
                    });

                    console.log(
                        "Password reset email sent successfully."
                    );

                } catch (emailError) {

                    // Prevent an undelivered link from remaining usable.
                    await db.query(
                        `UPDATE password_reset_tokens
                         SET used_at = UTC_TIMESTAMP()
                         WHERE token_hash = ?
                         AND used_at IS NULL`,
                        [tokenData.tokenHash]
                    );

                    console.error(
                        "Password reset email delivery failed:",
                        emailError.message
                    );
                }
            }
        }

        // Same response whether the email exists or not.
        return res.render("forgotPassword", {
            title: "Forgot Password",
            message: GENERIC_RESPONSE
        });

    } catch (error) {

        console.error(
            "Password reset request error:",
            error.message
        );

        return res.status(500).render("forgotPassword", {
            title: "Forgot Password",
            error: "We could not process your request. Please try again later."
        });
    }
};

// ================================================================
// SHOW RESET PASSWORD PAGE
// ================================================================

exports.showResetPasswordPage = async (req, res) => {

    setSecurityHeaders(res);

    const token = req.query.token;

    if (!isValidToken(token)) {

        return res.status(400).render("resetPassword", {
            title: "Reset Password",
            error: "This password reset link is invalid or expired.",
            token: ""
        });
    }

    try {

        const tokenHash = hashToken(token);

        const [rows] = await db.query(
            `SELECT prt.reset_token_id
             FROM password_reset_tokens prt

             INNER JOIN users u
                 ON u.UserID = prt.user_id
                AND u.business_id = prt.business_id

             WHERE prt.token_hash = ?
             AND prt.used_at IS NULL
             AND prt.expires_at > UTC_TIMESTAMP()
             AND u.IsActive = 1

             LIMIT 1`,
            [tokenHash]
        );

        if (rows.length === 0) {

            return res.status(400).render("resetPassword", {
                title: "Reset Password",
                error: "This password reset link is invalid or expired.",
                token: ""
            });
        }

        return res.render("resetPassword", {
            title: "Reset Password",
            token
        });

    } catch (error) {

        console.error(
            "Reset password page error:",
            error.message
        );

        return res.status(500).render("resetPassword", {
            title: "Reset Password",
            error: "Unable to verify your reset link. Please try again.",
            token: ""
        });
    }
};

// ================================================================
// COMPLETE PASSWORD RESET
// ================================================================

exports.resetPassword = async (req, res) => {

    setSecurityHeaders(res);

    const token = req.body?.token;

    const password = req.body?.password;

    const confirmPassword = req.body?.confirmPassword;

    if (!isValidToken(token)) {

        return res.status(400).render("resetPassword", {
            title: "Reset Password",
            error: "This password reset link is invalid or expired.",
            token: ""
        });
    }

    if (
        typeof password !== "string" ||
        password.length < PASSWORD_MIN_LENGTH
    ) {

        return res.status(400).render("resetPassword", {
            title: "Reset Password",
            error: `Your password must contain at least ${PASSWORD_MIN_LENGTH} characters.`,
            token
        });
    }

    // bcrypt only considers the first 72 bytes of a password.
    if (Buffer.byteLength(password, "utf8") > 72) {

        return res.status(400).render("resetPassword", {
            title: "Reset Password",
            error: "Your password must not exceed 72 bytes.",
            token
        });
    }

    if (password !== confirmPassword) {

        return res.status(400).render("resetPassword", {
            title: "Reset Password",
            error: "Your passwords do not match.",
            token
        });
    }

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        const tokenHash = hashToken(token);

        // Lock the valid reset token during the password update.
        const [rows] = await connection.query(
            `SELECT
                prt.reset_token_id,
                prt.user_id,
                prt.business_id

             FROM password_reset_tokens prt

             INNER JOIN users u
                 ON u.UserID = prt.user_id
                AND u.business_id = prt.business_id

             WHERE prt.token_hash = ?
             AND prt.used_at IS NULL
             AND prt.expires_at > UTC_TIMESTAMP()
             AND u.IsActive = 1

             LIMIT 1
             FOR UPDATE`,
            [tokenHash]
        );

        if (rows.length === 0) {

            await connection.rollback();

            return res.status(400).render("resetPassword", {
                title: "Reset Password",
                error: "This password reset link is invalid, expired or already used.",
                token: ""
            });
        }

        const resetRecord = rows[0];

        // Use the same bcrypt cost factor as MarketFlow registration.
        const passwordHash = await bcrypt.hash(password, 12);

        await connection.query(
            `UPDATE users
             SET PasswordHash = ?
             WHERE UserID = ?
             AND business_id = ?`,
            [
                passwordHash,
                resetRecord.user_id,
                resetRecord.business_id
            ]
        );

        // Mark all outstanding reset tokens for this user as used.
        await connection.query(
            `UPDATE password_reset_tokens
             SET used_at = UTC_TIMESTAMP()
             WHERE user_id = ?
             AND used_at IS NULL`,
            [resetRecord.user_id]
        );

        await connection.commit();

        console.log(
            `Password reset completed for UserID ${resetRecord.user_id}.`
        );

        return res.render("resetPassword", {
            title: "Password Reset Successful",
            success: "Your password has been changed successfully. You can now sign in.",
            token: ""
        });

    } catch (error) {

        await connection.rollback();

        console.error(
            "Password reset completion error:",
            error.message
        );

        return res.status(500).render("resetPassword", {
            title: "Reset Password",
            error: "We could not reset your password. Please try again.",
            token: ""
        });

    } finally {

        connection.release();
    }
};
