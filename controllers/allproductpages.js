const express = require("express");
const mysql = require("mysql2/promise");
const db = require("../Database/db");

const bcrypt = require("bcrypt");







exports.getallproductpages = async(req, res) => {
    res.render("inventory");
};
exports.getstockintake = async(req, res) => {
    res.render("stockintake")
}
exports.add = async(req, res) => {
    const {
        product_name,
        category,
        brand,
        unit,
        cost_price,
        selling_price,
        msrp,
        description,
        product_image,
        supplier_name

    } = req.body;

    try {


        await db.query(
            "INSERT INTO products (product_name, category, brand, unit, description, product_image, cost_price, selling_price, msrp, supplier_name) VALUES (?,?,?,?,?,?,?,?,?,?)", [
                product_name,
                category,
                brand,
                unit,
                description,
                product_image,
                cost_price,
                selling_price,
                msrp,
                supplier_name

            ]
        );
        res.send(`
            <script>
                alert("Product inserted successfully");

                window.location.href="/productpages/inventory";
            </script>
        `);

    } catch (error) {
        console.error(error);
        res.send(`
            <script>
                alert("Product fail to add ");

                window.location.href="/productpages/inventory";
            </script>`)
    }
};
exports.getallproducts = async(req, res) => {
    try {

        // Dashboard Summary
        const [
            [summary]
        ] = await db.query(`
            SELECT
                COALESCE(SUM(p.selling_price * s.quantity_received), 0) AS totalSales,
                COALESCE(SUM(p.cost_price * s.quantity_received), 0) AS totalCost,
                COALESCE(SUM((p.selling_price - p.cost_price) * s.quantity_received), 0) AS totalProfit
            FROM products p
            LEFT JOIN stock s
                ON p.product_id = s.product_id;
        `);

        // Products Expiring Within 30 Days
        const [
            [expiryResult]
        ] = await db.query(`
            SELECT COUNT(*) AS expiringSoon
            FROM stock
            WHERE expiry_date IS NOT NULL
              AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY);
             
        `);
        /* AND quantity_available > 0*/
        ;
        // Product List
        const [products] = await db.query(`
            SELECT
                p.product_id,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.created_at,                
                COALESCE(SUM(s.quantity_received), 0) AS totalreceived,
                COUNT(s.stock_id) AS total_batches

            FROM products p
            LEFT JOIN stock s
                ON p.product_id = s.product_id

            GROUP BY
                p.product_id,
                p.product_name,
                p.category,
                p.brand,
                p.unit,
                p.description,
                p.product_image,
                p.cost_price,
                p.selling_price,
                p.msrp,
                p.supplier_name,
                p.created_at

            ORDER BY p.product_name ASC;
        `);

        res.render("products", {
            products,
            totalsales: summary.totalSales,
            totalcost: summary.totalCost,
            totalProfit: summary.totalProfit,
            expiringdate: expiryResult.expiringSoon
        });

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Failed to get products");
    }
};


/*
========================
UPDATE PRODUCT
========================
*/
exports.updateProduct = async(req, res) => {

    try {

        const {
            product_id,
            product_name,
            category,
            brand,
            unit,
            description,
            product_image,
            cost_price,
            selling_price,
            msrp,
            supplier_name

        } = req.body;



        await db.query(
            `
            UPDATE products
            SET
                product_name = ?,
                category = ?,
                brand = ?,
                unit = ?,
                description = ?,
                product_image = ?,
                cost_price = ?,
                selling_price = ?,
                msrp = ?,
                supplier_name = ?
                
            WHERE product_id = ?
            `, [
                product_name,
                category,
                brand,
                unit,
                description,
                product_image,
                cost_price,
                selling_price,
                msrp,
                supplier_name,
                product_id
            ]
        );

        res.send(`
            <script>
                alert("Product is updated successfully");

                window.location.href="/productpages/products";
            </script>
        `);

    } catch (error) {
        console.error(error);
        res.status(500).send("Update failed");
    }
};
/*
============================
SEARCH PRODUCTS
============================
*/

exports.searchProducts = async(req, res) => {

    try {

        const search = req.query.search;

        if (!search) {
            return res.json([]);
        }

        const [products] = await db.query(

            `SELECT
                product_id,
                product_name,
                category,
                brand
            FROM products
            WHERE product_name LIKE ?
            ORDER BY product_name
            LIMIT 10`,

            [`%${search}%`]

        );

        res.json(products);

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server Error"
        });

    }

};
/*
========================
ADD STOCK
========================
*/

exports.addStock = async(req, res) => {

    try {

        const {
            product_id,
            batch_number,
            quantity_received,
            expiry_date
        } = req.body;


        if (!product_id) {
            return res.send(`
                <script>
                    alert("Please select a product from the search list.");
                    window.history.back();
                </script>
            `);
        }
        let newexpiringdate = expiry_date
        if (!newexpiringdate || newexpiringdate.trim() === "") {
            newexpiringdate = null;
        }
        await db.query(
            `
            INSERT INTO stock
            (
                product_id,
                batch_number,
                quantity_received,                
                stock_date,
                expiry_date
            )
            VALUES
            (
                ?,
                ?,                
                ?,
                CURDATE(),
                ?
            )
            `, [
                product_id,
                batch_number,
                quantity_received,
                // Quantity Available = Quantity Received
                newexpiringdate
            ]
        );

        res.send(`
            <script>
                alert("Stock added successfully.");
                window.location.href="/productpages/stockintake";
            </script>
        `);

    } catch (error) {

        console.error(error);

        res.send(`
            <script>
                alert("Failed to add stock.");
                window.history.back();
            </script>
        `);

    }

};



exports.getallproductsinmain = async(req, res) => {




    try {


        if (!req.session.user) {
            return res.redirect("/login");
        }
        // Dashboard Summary
        const [
            [summary]
        ] = await db.query(`
            SELECT
                COALESCE(SUM(p.selling_price * s.quantity_received), 0) AS totalSales,
                COALESCE(SUM(p.cost_price * s.quantity_received), 0) AS totalCost,
                COALESCE(SUM((p.selling_price - p.cost_price) * s.quantity_received), 0) AS totalProfit
            FROM products p
            LEFT JOIN stock s
                ON p.product_id = s.product_id;
        `);

        // Products Expiring Within 30 Days
        /* const [
             [expiryResult]
         ] = await db.query(`
             SELECT COUNT(*) AS expiringSoon
             FROM stock
             WHERE expiry_date IS NOT NULL
               AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY);
              
         `);
         /*  {{expiringdate: expiryResult.expiringSoon}}  AND quantity_available > 0*/
        ;
        // Product List
        const [categories] = await db.query(`
                SELECT DISTINCT category FROM products
            `);

        const [products] = await db.query(`
                    SELECT p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    p.created_at,
                    COALESCE(SUM(s.quantity_received), 0) AS totalreceived,
                    COUNT(s.stock_id) AS total_batches

                    FROM products p LEFT JOIN stock s ON p.product_id = s.product_id

                    GROUP BY p.product_id,
                    p.product_name,
                    p.category,
                    p.brand,
                    p.unit,
                    p.description,
                    p.product_image,
                    p.cost_price,
                    p.selling_price,
                    p.msrp,
                    p.supplier_name,
                    p.created_at

                    ORDER BY p.product_name ASC;
                    `);

        res.render("main", {
            name: req.session.user.name,
            products,
            totalsales: summary.totalSales,
            totalcost: summary.totalCost,
            totalProfit: summary.totalProfit,
            categories

        });

        

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Failed to get products");
    }
};