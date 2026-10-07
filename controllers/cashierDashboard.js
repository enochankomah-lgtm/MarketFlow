// =========================================
// MARKETFLOW - CASHIER DASHBOARD CONTROLLER
// =========================================

const db = require("../Database/db");


// =========================================
// CASHIER DASHBOARD
// =========================================

const getCashierDashboard = async (req, res) => {

    try {

        // -----------------------------------------
        // 1. CHECK LOGIN
        // -----------------------------------------

        if (!req.session.user) {
            return res.redirect("/login");
        }


        // -----------------------------------------
        // 2. GET CURRENT CASHIER
        // -----------------------------------------

        const cashierId = req.session.user.id;


        // -----------------------------------------
        // 3. TODAY'S SALES SUMMARY
        // -----------------------------------------

        const [todaySummary] = await db.query(`
            SELECT
                COALESCE(SUM(GrandTotal), 0) AS totalSales,
                COUNT(*) AS transactionCount
            FROM sales
            WHERE cashier_id = ?
            AND sale_status = 'Completed'
            AND DATE(created_at) = CURDATE()
        `, [cashierId]);


        // -----------------------------------------
        // 4. TODAY'S ITEMS SOLD
        // -----------------------------------------

        const [itemsSummary] = await db.query(`
            SELECT
                COALESCE(SUM(si.quantity), 0) AS itemsSold
            FROM sales_item si
            INNER JOIN sales s
                ON si.sale_id = s.sale_id
            WHERE s.cashier_id = ?
            AND s.sale_status = 'Completed'
            AND DATE(s.created_at) = CURDATE()
        `, [cashierId]);


        // -----------------------------------------
        // 5. PAYMENT METHOD SUMMARY
        // -----------------------------------------

        const [paymentSummary] = await db.query(`
            SELECT
                payment_method,
                COALESCE(SUM(GrandTotal), 0) AS amount,
                COUNT(*) AS transactions
            FROM sales
            WHERE cashier_id = ?
            AND sale_status = 'Completed'
            AND DATE(created_at) = CURDATE()
            GROUP BY payment_method
            ORDER BY amount DESC
        `, [cashierId]);


        // -----------------------------------------
        // 6. SALES TREND - LAST 7 DAYS
        // -----------------------------------------

        const [salesTrend] = await db.query(`
            SELECT
                DATE(created_at) AS saleDate,
                COALESCE(SUM(GrandTotal), 0) AS totalSales,
                COUNT(*) AS transactions
            FROM sales
            WHERE cashier_id = ?
            AND sale_status = 'Completed'
            AND created_at >= CURDATE() - INTERVAL 6 DAY
            GROUP BY DATE(created_at)
            ORDER BY saleDate ASC
        `, [cashierId]);


        // -----------------------------------------
        // 7. TOP SELLING PRODUCTS TODAY
        // -----------------------------------------

        const [topProducts] = await db.query(`
            SELECT
                si.product_id,
                si.product_name,
                SUM(si.quantity) AS quantitySold,
                COALESCE(SUM(si.total_price), 0) AS revenue
            FROM sales_item si
            INNER JOIN sales s
                ON si.sale_id = s.sale_id
            WHERE s.cashier_id = ?
            AND s.sale_status = 'Completed'
            AND DATE(s.created_at) = CURDATE()
            GROUP BY
                si.product_id,
                si.product_name
            ORDER BY quantitySold DESC
            LIMIT 5
        `, [cashierId]);


        // -----------------------------------------
        // 8. RECENT TRANSACTIONS
        // -----------------------------------------

        const [recentTransactions] = await db.query(`
            SELECT
                s.sale_id,
                s.invoice_number,
                s.GrandTotal,
                s.payment_method,
                s.sale_status,
                s.created_at,
                COALESCE(
                    c.customer_name,
                    'Walk-in Customer'
                ) AS customer_name
            FROM sales s
            LEFT JOIN customers c
                ON s.customer_id = c.customer_id
            WHERE s.cashier_id = ?
            ORDER BY s.created_at DESC
            LIMIT 10
        `, [cashierId]);


        // -----------------------------------------
        // 9. LOW STOCK PRODUCTS
        // -----------------------------------------

        const [lowStock] = await db.query(`
            SELECT
                p.product_id,
                p.product_name,
                COALESCE(
                    SUM(st.quantity_available),
                    0
                ) AS quantity_available
            FROM products p
            LEFT JOIN stock st
                ON p.product_id = st.product_id
            GROUP BY
                p.product_id,
                p.product_name
            HAVING quantity_available <= 5
            ORDER BY quantity_available ASC
            LIMIT 5
        `);


        // -----------------------------------------
        // 10. EXPIRING STOCK
        // -----------------------------------------

        const [expiringStock] = await db.query(`
            SELECT
                st.stock_id,
                p.product_name,
                st.batch_number,
                st.quantity_available,
                st.expiry_date,
                DATEDIFF(
                    st.expiry_date,
                    CURDATE()
                ) AS days_remaining
            FROM stock st
            INNER JOIN products p
                ON st.product_id = p.product_id
            WHERE st.quantity_available > 0
            AND st.expiry_date IS NOT NULL
            AND st.expiry_date >= CURDATE()
            AND st.expiry_date <= CURDATE() + INTERVAL 30 DAY
            ORDER BY st.expiry_date ASC
            LIMIT 5
        `);


        // -----------------------------------------
        // 11. PENDING PAYMENTS
        // -----------------------------------------

        const [pendingPayments] = await db.query(`
            SELECT
                s.sale_id,
                s.invoice_number,
                s.GrandTotal,
                s.payment_method,
                s.created_at,
                p.payment_status,
                p.transaction_ref
            FROM sales s
            LEFT JOIN payments p
                ON s.sale_id = p.sale_id
            WHERE s.cashier_id = ?
            AND (
                s.sale_status = 'Pending'
                OR p.payment_status = 'Pending'
            )
            ORDER BY s.created_at DESC
            LIMIT 5
        `, [cashierId]);


        // -----------------------------------------
        // 12. PAYMENT VALUES
        // -----------------------------------------

        const paymentMethods = {
            Cash: 0,
            "Mobile Money": 0,
            Card: 0,
            "Bank Transfer": 0,
            "Split Payment": 0
        };


        paymentSummary.forEach(payment => {

            const method = payment.payment_method;

            if (
                Object.prototype.hasOwnProperty.call(
                    paymentMethods,
                    method
                )
            ) {
                paymentMethods[method] =
                    Number(payment.amount);
            }

        });

        const [todaySalesTrend] = await db.query(`
            SELECT
                HOUR(created_at) AS saleHour,
                COALESCE(SUM(GrandTotal), 0) AS totalSales,
                COUNT(*) AS transactions
            FROM sales
            WHERE cashier_id = ?
            AND sale_status = 'Completed'
            AND DATE(created_at) = CURDATE()
            GROUP BY HOUR(created_at)
            ORDER BY saleHour ASC
        `, [cashierId]);


        // -----------------------------------------
        // 13. CASHIER INFORMATION
        // -----------------------------------------

        const cashier = {

            id: req.session.user.id,

            name: req.session.user.name,

            email: req.session.user.email,

            role: req.session.user.RoleName,

            businessName: req.session.user.Business_name

        };


        // -----------------------------------------
        // 14. RENDER DASHBOARD
        // -----------------------------------------

        return res.render("cashier-dashboard", {

            cashier,

            today: new Date(),

            totalSales:
                Number(todaySummary[0].totalSales),

            transactionCount:
                Number(todaySummary[0].transactionCount),

            itemsSold:
                Number(itemsSummary[0].itemsSold),

            paymentSummary,

            paymentMethods,

            salesTrend,

            topProducts,

            recentTransactions,

            lowStock,

            expiringStock,

            pendingPayments,

            salesTrendJSON: JSON.stringify(salesTrend),
            todaySalesTrend,
            todaySalesTrendJSON: JSON.stringify(todaySalesTrend)

        });


    } catch (error) {

        console.error(
            "Cashier Dashboard Error:",
            error
        );

        return res.status(500).send(
            "Unable to load cashier dashboard."
        );

    }

};


// =========================================
// EXPORT
// =========================================

module.exports = {
    getCashierDashboard
};