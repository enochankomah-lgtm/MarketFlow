"use strict";

const express = require("express");
const dotenv = require("dotenv");
const hbs = require("hbs");
const path = require("path");
const session = require("express-session");

dotenv.config({ path: "./.env" });

const app = express();

// ================================================================
// ENVIRONMENT VALIDATION
// ================================================================

if (!process.env.SESSION_SECRET) {
throw new Error("SESSION_SECRET is not configured in .env");
}

if (!process.env.PAYSTACK_SECRET_KEY) {
console.warn("WARNING: PAYSTACK_SECRET_KEY is not configured.");
}

// ================================================================
// ROUTES / CONTROLLERS
// ================================================================

const paymentRoutes = require("./routes/paymentRoutes");
const paymentController = require("./controllers/paymentController");
const cashierDashboardRoutes = require("./routes/cashierDashboardRoutes");
const inventoryRoutes = require("./routes/inventoryanalysis");
const Revenueprofit = require("./routes/profitableAnalysis");
const productPerformanceRoutes = require("./routes/productPerformance");
const settingsRoutes = require("./routes/settingsRoutes");
const onboardingRoutes = require("./routes/onboardingRoutes");
const creditApprovalRoutes = require("./routes/creditApprovalRoutes");
const adminRoutes = require("./routes/adminRoutes");
const stockMovementRoutes = require("./routes/stockMovement");
const branchRoutes = require("./routes/branch");
const customerOverviewRoutes = require("./routes/customerOverview");

// HANDLEBARS HELPERS

hbs.registerHelper("numberequal", function (a, b) {
    return Number(a) === Number(b);
});

hbs.registerHelper("lt", function (a, b) {
    return Number(a) < Number(b);
});

hbs.registerHelper("eq", function (a, b) {
    return a === b;
});

hbs.registerHelper("ifEquals", function (a, b, options) {
    return String(a) === String(b)
        ? options.fn(this)
        : options.inverse(this);
});

// ================================================================
// VIEW ENGINE
// ================================================================

app.set("view engine", "hbs");
app.set("views", path.join(__dirname, "views"));

// ================================================================
// PAYSTACK WEBHOOK
// ================================================================

app.post("/api/payments/paystack/webhook",express.raw({type: "application/json",limit: "1mb"}),paymentController.paystackWebhook);

// ================================================================
// BODY PARSERS
// ================================================================

app.use(express.json({ limit: "1mb" }));

app.use(
express.urlencoded({
extended: true,
limit: "1mb"
})
);

// ================================================================
// SESSION
// ================================================================

app.use(
session({
secret: process.env.SESSION_SECRET,
resave: false,
saveUninitialized: false,
cookie: {
httpOnly: true,
secure: process.env.NODE_ENV === "production",
sameSite: "lax",
maxAge: 1000 * 60 * 60 * 8
}
})
);

// ================================================================
// STATIC FILES
// ================================================================

const publicDirectory = path.join(__dirname, "public");

app.use(express.static(publicDirectory));

// ================================================================
// PUBLIC ROUTES
// ================================================================

app.use("/", require("./routes/pages"));
app.use("/auth", require("./routes/auth"));
app.use("/", onboardingRoutes);

// ================================================================
// ADMIN ROUTES
// ================================================================

app.use("/admin", adminRoutes);

// ================================================================
// APPLICATION ROUTES
// ================================================================

app.use("/productpages", require("./routes/productpages"));
app.use("/api/payments", paymentRoutes);
app.use("/stockanalysis", inventoryRoutes);
app.use("/", Revenueprofit);
app.use("/", cashierDashboardRoutes);
app.use("/", productPerformanceRoutes);
app.use("/", settingsRoutes);
app.use("/credit-approvals", creditApprovalRoutes);
app.use("/branches", branchRoutes);
app.use("/", customerOverviewRoutes );

// ================================================================
// STOCK MOVEMENTS
// ================================================================
// Must come AFTER express-session.

app.use(
"/stock-movements",
stockMovementRoutes
);

// ================================================================
// PAYSTACK CONFIGURATION STATUS
// ================================================================

console.log(
process.env.PAYSTACK_SECRET_KEY
? "Paystack key loaded successfully"
: "Paystack key NOT loaded"
);

// ================================================================
// 404 HANDLER
// ================================================================

app.use((req, res) => {
res.status(404).json({
success: false,
message: "Page not found"
});
});

// ================================================================
// GLOBAL ERROR HANDLER
// ================================================================

app.use((err, req, res, next) => {
console.error("Unhandled application error:", err);


if (res.headersSent) {
    return next(err);
}

res.status(500).json({
    success: false,
    message: "Something went wrong."
});


});

// ================================================================
// START SERVER
// ================================================================

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
console.log(`MarketFlow server started on port ${PORT}`);
});
