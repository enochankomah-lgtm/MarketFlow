const db = require('../Database/db');
const bcrypt = require('bcrypt');

const onboardingController = {

    // =========================================================
    // SHOW ONBOARDING PAGE
    // =========================================================
    showOnboarding: (req, res) => {
        res.render('onboarding', {
            title: 'Register Your Business | MarketFlow'
        });
    },


    // =========================================================
    // REGISTER BUSINESS + FIRST BRANCH + OWNER
    // =========================================================
    registerBusiness: async (req, res) => {

        let connection;

        try {

            // -------------------------------------------------
            // GET FORM DATA
            // -------------------------------------------------
            const {
                business_name,
                business_phone,
                business_email,
                business_address,
                business_city,

                branch_name,
                branch_location,
                branch_phone,

                first_name,
                last_name,
                owner_email,
                owner_phone,
                password,
                confirm_password
            } = req.body;


            // -------------------------------------------------
            // CLEAN INPUT
            // -------------------------------------------------
            const businessName = (business_name || '').trim();
            const businessPhone = (business_phone || '').trim();
            const businessEmail = (business_email || '').trim().toLowerCase();
            const businessAddress = (business_address || '').trim();
            const businessCity = (business_city || '').trim();

            const branchName = (branch_name || '').trim();
            const branchLocation = (branch_location || '').trim();
            const branchPhone = (branch_phone || '').trim();

            const firstName = (first_name || '').trim();
            const lastName = (last_name || '').trim();
            const ownerEmail = (owner_email || '').trim().toLowerCase();
            const ownerPhone = (owner_phone || '').trim();

            const userPassword = password || '';
            const confirmPassword = confirm_password || '';


            // -------------------------------------------------
            // REQUIRED FIELD VALIDATION
            // -------------------------------------------------
            if (
                !businessName ||
                !branchName ||
                !firstName ||
                !lastName ||
                !ownerEmail ||
                !userPassword ||
                !confirmPassword
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Please complete all required fields.'
                });
            }


            // -------------------------------------------------
            // EMAIL VALIDATION
            // -------------------------------------------------
            const emailRegex =
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailRegex.test(ownerEmail)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid owner email address.'
                });
            }


            // -------------------------------------------------
            // BUSINESS EMAIL VALIDATION
            // -------------------------------------------------
            if (
                businessEmail &&
                !emailRegex.test(businessEmail)
            ) {
                return res.status(400).json({
                    success: false,
                    message: 'Please enter a valid business email address.'
                });
            }


            // -------------------------------------------------
            // PASSWORD VALIDATION
            // -------------------------------------------------
            if (userPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must contain at least 8 characters.'
                });
            }


            if (userPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Passwords do not match.'
                });
            }


            // -------------------------------------------------
            // GET DATABASE CONNECTION
            // -------------------------------------------------
            connection = await db.getConnection();


            // -------------------------------------------------
            // START TRANSACTION
            // -------------------------------------------------
            await connection.beginTransaction();


            // =================================================
            // 1. CREATE BUSINESS
            // =================================================
            const [businessResult] = await connection.query(
                `
                INSERT INTO businesses
                (
                    business_name,
                    phone,
                    email,
                    address,
                    city
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    businessName,
                    businessPhone || null,
                    businessEmail || null,
                    businessAddress || null,
                    businessCity || null
                ]
            );

            const businessId = businessResult.insertId;


            // =================================================
            // 2. CREATE FIRST BRANCH
            // =================================================
            const [branchResult] = await connection.query(
                `
                INSERT INTO branches
                (
                    business_id,
                    business_name,
                    branch_name,
                    location,
                    phone
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    businessId,
                    businessName,
                    branchName,
                    branchLocation || null,
                    branchPhone || null
                ]
            );

            const branchId = branchResult.insertId;


            // =================================================
            // 3. HASH OWNER PASSWORD
            // =================================================
            const passwordHash = await bcrypt.hash(
                userPassword,
                12
            );


            // =================================================
            // 4. CREATE OWNER USER
            // =================================================
            const [userResult] = await connection.query(
                `
                INSERT INTO users
                (
                    business_id,
                    FirstName,
                    LastName,
                    JobTitle,
                    RoleName,
                    Business_name,
                    Business_location,
                    branch_id,
                    Email,
                    Phone,
                    PasswordHash,
                    IsActive
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    businessId,
                    firstName,
                    lastName,
                    'Business Owner',
                    'Owner',
                    businessName,
                    branchLocation || businessAddress || null,
                    branchId,
                    ownerEmail,
                    ownerPhone || null,
                    passwordHash,
                    1
                ]
            );

            const ownerId = userResult.insertId;


            // =================================================
            // 5. COMMIT TRANSACTION
            // =================================================
            await connection.commit();


            // =================================================
            // 6. CREATE AUTHENTICATED SESSION
            // =================================================
            if (req.session) {

                req.session.user = {
                    UserID: ownerId,
                    business_id: businessId,
                    branch_id: branchId,
                    FirstName: firstName,
                    LastName: lastName,
                    RoleName: 'Owner',
                    Email: ownerEmail
                };
            }


            // =================================================
            // 7. SUCCESS RESPONSE
            // =================================================
            return res.status(201).json({
                success: true,
                message: 'Your business has been registered successfully.',
                redirect: '/'
            });


        } catch (error) {

            // -------------------------------------------------
            // ROLLBACK IF TRANSACTION STARTED
            // -------------------------------------------------
            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        'Rollback error:',
                        rollbackError.message
                    );
                }
            }


            // -------------------------------------------------
            // LOG REAL ERROR ON SERVER
            // -------------------------------------------------
            console.error(
                'Business registration error:',
                error
            );


            // -------------------------------------------------
            // DUPLICATE ENTRY
            // -------------------------------------------------
            if (error.code === 'ER_DUP_ENTRY') {

                if (
                    error.sqlMessage &&
                    error.sqlMessage.includes('uq_business_name')
                ) {
                    return res.status(409).json({
                        success: false,
                        message: 'A business with this name already exists.'
                    });
                }

                if (
                    error.sqlMessage &&
                    error.sqlMessage.includes('Email')
                ) {
                    return res.status(409).json({
                        success: false,
                        message: 'An account with this email already exists.'
                    });
                }

                return res.status(409).json({
                    success: false,
                    message: 'Some of the information provided already exists.'
                });
            }


            // -------------------------------------------------
            // GENERAL SERVER ERROR
            // -------------------------------------------------
            return res.status(500).json({
                success: false,
                message:
                    'Unable to complete business registration. Please try again.'
            });


        } finally {

            // -------------------------------------------------
            // RELEASE CONNECTION
            // -------------------------------------------------
            if (connection) {
                connection.release();
            }
        }
    }
};


module.exports = onboardingController;
