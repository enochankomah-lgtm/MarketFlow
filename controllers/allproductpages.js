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
        console.log(error);
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


exports.searchProducts = async(req, res) => {

    try {

        const search = req.query.search;

        if (!search) {
            return res.json([]);
        }

        const [products] = await db.query(

            `SELECT * FROM products
            WHERE product_name LIKE ?
            ORDER BY product_name
            LIMIT 5`,

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

exports.addsalesproduct = async(req,res)=>{

    const {ProductId,product_name,quantity,PriceEach,TotalPrice} = req.body;

    try{

        await db.query(
            `
            insert into sales_Item_initial 
            (product_id,
             product_name,
             quantity,
             cost_price,
             total_price)

             values
             (?,?,?,?,?)
            `,
            [ProductId, product_name, quantity, PriceEach, TotalPrice]
        );

         res.redirect('/productpages/main');
    } catch (err) {
        console.log( err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
} 

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
        
        // Product List
        const [categories] = await db.query(`
                SELECT DISTINCT category FROM products
            `);

             const [initialsales] = await db.query(`
                        select 
                        sales_id, 
                        product_id, 
                        product_name, 
                        quantity, 
                        cost_price, 
                        total_price, 
                        sale_date 
                        from sales_item_initial;
                        `);

            const [[Subtotal]] = await db.query(`
                select sum(total_price) as subtotal from sales_item_initial;
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

                        const [[discount]] = await db.query(`
                            call discount();
                        `);

                        const [[tax]] = await db.query(`
                            call tax();
                        `);

                        const [temporalsales] = await db.query(`
                            SELECT
                                invoice_number,
                                cashier_id,
                                customer_id,
                                hold_status,
                                DATE_FORMAT(
                                    created_at,
                                    '%d %b %Y %h:%i %p'
                                ) AS created_at
                            FROM held_sales
                        `);

                        const subtotal = Number(Subtotal.subtotal) || 0;

                        const discountRate = Number(discount[0].discount_rate) || 0;

                        const taxRate = Number(tax[0].tax_rate) || 0;

                        const discountAmount = subtotal * (discountRate / 100);

                        const amountAfterDiscount = subtotal - discountAmount;

                        const taxAmount =  amountAfterDiscount * (taxRate / 100);

                        const grandTotal = (amountAfterDiscount + taxAmount).toFixed(2);
                        

                    res.render("main", {
                        name: req.session.user.name,
                        email: req.session.user.email,
                        location: req.session.user.Business_location,
                        phone: req.session.user.Phone,
                        RoleName: req.session.user.RoleName,
                        Business_name: req.session.user.Business_name,

                        products,
                        initialsales,
                        temporalsales,
                        categories,

                        discount: discountRate,
                        tax: taxRate,
                        subtotal: subtotal,

                        discountAmount: discountAmount,
                        taxAmount: taxAmount,
                        grandTotal: grandTotal

                      });

        

    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Failed to get products");
    }
};

exports.getallsalesinit = async (req,res) => {

    try{
        const [initialsales] = await db.query(`
            select 
            sales_id, 
            product_id, 
            product_name, 
            quantity, 
            cost_price, 
            total_price, 
            sale_date 
            from sales_item_initial;
            `);
            
           console.log(initialsales);

            res.render('main',{
                initialsales

            });

    } 
    catch (error) {
        console.log('Failed to get sales',error)
        res.status(500).send('Failed to get sales')
    };   

}


exports.ClearAllCarts = async(req,res)=>{
    try{
       await db.query(`
          truncate table sales_item_initial;
        `)

        res.send(`
            <script>

            if(confirm('please do you want to clear all carts ')){
             window.location.href = '/productpages/main'
            } else {
                window.history.back();
                }
            
            </script>
            `)
    }
    catch(error){
        console.log(error);
    }
}

exports.deleteitem = async(req,res)=>{

    try{

        const sales_id = req.params.sales_id

        await db.query('DELETE from sales_item_initial where sales_id =?',[sales_id]);
        res.json({
            success:true,
            message:'Item delete succesfully'
        })
    }
    catch(error){
        console.log(error);
        res.status(500).json({
            success:false,
            message:'Failed to delete the this item'
        });
    }
}

exports.holdSale = async (req, res) => {

    const connection = await db.getConnection();

    try {

        await connection.beginTransaction();

        // Step 1
        const [cartItems] = await connection.query(
            `SELECT product_id,product_name,quantity,cost_price,total_price FROM sales_item_initial`
        );

        if (cartItems.length === 0) {
            return res.json({
                success: false,
                message: "Cart is empty."
            });
        }

        // Step 2
        // let subtotal = 0;

        //cartItems.forEach(item => {
        //    subtotal += Number(item.total_price);
        // });

        const invoice =
            "INV" + Date.now();
            

        // Step 3
        const [holdSale] = await connection.query(
            `
            INSERT INTO held_sales
            (
                invoice_number,
                cashier_id,
                customer_id
                
            )
            VALUES(?,?,?)
            `,
            [
                invoice,
                req.session.user.id,
                null
               // subtotal,
              //  subtotal
            ]
        );

        const holdId = holdSale.insertId;

        // Step 4
        for (const item of cartItems) {

            await connection.query(
                `
                INSERT INTO held_sale_items
                (
                    hold_id,
                    product_id,
                    product_name,
                    quantity,
                    selling_price,
                    total_price
                )
                VALUES(?,?,?,?,?,?)
                `,
                [
                    holdId,
                    item.product_id,
                    item.product_name,
                    item.quantity,
                    item.cost_price,
                    item.total_price
                ]
            );
        }

        await connection.query(
            `TRUNCATE TABLE sales_item_initial`
        );
        await connection.commit();

        res.send(`
            <script>
            if(confirm('Sales are held successfully')){
            window.location.href = '/productpages/main'
            } else{                
                window.history.back();
                }      
            </script>            
            `          
        );

    }
    catch(error){

        await connection.rollback();
        console.log(error);

        res.status(500).json({
            success:false,
            message:"Unable to hold sale."
        });
    }
    finally{
        connection.release();
    }
}

exports.recallHoldSale = async (req,res)=>{

    const connection = await db.getConnection();

    try{

        await connection.beginTransaction();

        const invoiceNumber = req.params.invoiceNumber;

        const [heldSale] = await connection.query(
            `
            SELECT hold_id
            FROM held_sales
            WHERE invoice_number = ?
            `,
            [invoiceNumber]
        );

        if(heldSale.length === 0){

            return res.json({
                success:false,
                message:"Held sale not found."
            });

        }

        const holdId = heldSale[0].hold_id;

                const [items] = await connection.query(
            `
            SELECT
                product_id,
                product_name,
                quantity,
                selling_price,
                total_price
            FROM held_sale_items
            WHERE hold_id = ?
            `,
            [holdId]
        );

                for(const item of items){

            await connection.query(
                `
                INSERT INTO sales_item_initial
                (
                    product_id,
                    product_name,
                    quantity,
                    cost_price,
                    total_price
                )
                VALUES(?,?,?,?,?)
                `,
                [
                    item.product_id,
                    item.product_name,
                    item.quantity,
                    item.selling_price,
                    item.total_price
                ]
            );

        }

                await connection.query(
            `DELETE FROM held_sale_items WHERE hold_id=?`,
            [holdId]
        );

        await connection.query(
            `DELETE FROM held_sales WHERE hold_id=?`,
            [holdId]
        );

        await connection.commit();

        res.json({
            success:true
        });

    }catch(error){

        await connection.rollback();
        console.log(error);

        res.status(500).json({
            success:false
        });

    }finally{

        connection.release();

    }

};


exports.deleteallsales = async (req, res) => {

    const connection = await db.getConnection();

    try {

        await connection.query(`
            TRUNCATE TABLE sales_item_initial
        `);

        await connection.query(`
            TRUNCATE TABLE held_sale_items
        `);

        await connection.query(`
            TRUNCATE TABLE held_sales
        `);

        res.send(`
            <script>
                alert("All sales transactions have been deleted successfully.");
                window.location.href = "/productpages/main";
            </script>
        `);

    } catch (error) {

        console.error("Error while deleting sales:", error);

        res.status(500).send(`
            <script>
                alert("Unable to delete sales records.");
                window.history.back();
            </script>
        `);

    } finally {

        connection.release();

    }

};