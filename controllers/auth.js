const db=require("../Database/db");
const bcrypt=require("bcrypt");
const crypto=require("crypto");

// ================================================================
// EMPLOYEE PASSWORD SETUP PAGE
// ================================================================

exports.showEmployeeSetup = async (req, res) => {
    const rawToken = String(req.query.token || "").trim();

    if (!rawToken) {
        return res.status(400).render("employeeSetup", {
            title: "Set Up Your Account",
            error: "This setup link is invalid."
        });
    }

    try {
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        const [tokens] = await db.query(
            `
            SELECT
                est.setup_token_id,
                est.user_id,
                est.business_id,
                est.expires_at,
                est.used_at,
                u.FirstName,
                u.LastName,
                u.Email,
                u.IsActive
            FROM employee_setup_tokens est
            INNER JOIN Users u
                ON u.UserID = est.user_id
                AND u.business_id = est.business_id
            WHERE est.token_hash = ?
            LIMIT 1
            `,
            [tokenHash]
        );

        if (tokens.length === 0) {
            return res.status(400).render("employeeSetup", {
                title: "Set Up Your Account",
                error: "This setup link is invalid or no longer available."
            });
        }

        const token = tokens[0];

        if (token.used_at) {
            return res.status(400).render("employeeSetup", {
                title: "Set Up Your Account",
                error: "This setup link has already been used."
            });
        }

        if (new Date(token.expires_at) <= new Date()) {
            return res.status(400).render("employeeSetup", {
                title: "Set Up Your Account",
                error: "This setup link has expired. Please contact your administrator."
            });
        }

        if (Number(token.IsActive) !== 1) {
            return res.status(403).render("employeeSetup", {
                title: "Set Up Your Account",
                error: "This employee account is currently inactive."
            });
        }

        return res.render("employeeSetup", {
            title: "Set Up Your Account",
            token: rawToken,
            firstName: token.FirstName,
            lastName: token.LastName,
            email: token.Email
        });

    } catch (error) {
        console.error("Employee setup page error:", error);

        return res.status(500).render("employeeSetup", {
            title: "Set Up Your Account",
            error: "Unable to open the account setup page."
        });
    }
},


// ================================================================
// COMPLETE EMPLOYEE PASSWORD SETUP
// ================================================================

exports.completeEmployeeSetup = async (req, res) => {
    const rawToken = String(req.body.token || "").trim();

    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirm_password || "");

    if (!rawToken) {
        return res.status(400).json({
            success: false,
            message: "Invalid setup token."
        });
    }

    if (!password || !confirmPassword) {
        return res.status(400).json({
            success: false,
            message: "Password and confirmation are required."
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters long."
        });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({
            success: false,
            message: "Passwords do not match."
        });
    }

    let connection;

    try {
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        connection = await db.getConnection();

        await connection.beginTransaction();

        const [tokens] = await connection.query(
            `
            SELECT
                setup_token_id,
                user_id,
                business_id,
                expires_at,
                used_at
            FROM employee_setup_tokens
            WHERE token_hash = ?
            LIMIT 1
            FOR UPDATE
            `,
            [tokenHash]
        );

        if (tokens.length === 0) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "This setup link is invalid."
            });
        }

        const token = tokens[0];

        if (token.used_at) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "This setup link has already been used."
            });
        }

        if (new Date(token.expires_at) <= new Date()) {
            await connection.rollback();

            return res.status(400).json({
                success: false,
                message: "This setup link has expired."
            });
        }


        // --------------------------------------------------------
        // VERIFY EMPLOYEE
        // --------------------------------------------------------

        const [users] = await connection.query(
            `
            SELECT
                UserID,
                business_id,
                IsActive
            FROM Users
            WHERE UserID = ?
            AND business_id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [
                token.user_id,
                token.business_id
            ]
        );

        if (users.length === 0) {
            await connection.rollback();

            return res.status(404).json({
                success: false,
                message: "Employee account could not be found."
            });
        }

        const employee = users[0];

        if (Number(employee.IsActive) !== 1) {
            await connection.rollback();

            return res.status(403).json({
                success: false,
                message: "This employee account is inactive."
            });
        }


        // --------------------------------------------------------
        // HASH PASSWORD
        // --------------------------------------------------------

        const passwordHash = await bcrypt.hash(password, 12);


        // --------------------------------------------------------
        // SAVE PASSWORD
        // --------------------------------------------------------

        await connection.query(
            `
            UPDATE Users
            SET PasswordHash = ?
            WHERE UserID = ?
            AND business_id = ?
            `,
            [
                passwordHash,
                token.user_id,
                token.business_id
            ]
        );


        // --------------------------------------------------------
        // MARK TOKEN AS USED
        // --------------------------------------------------------

        await connection.query(
            `
            UPDATE employee_setup_tokens
            SET used_at = NOW()
            WHERE setup_token_id = ?
            AND user_id = ?
            AND business_id = ?
            AND used_at IS NULL
            `,
            [
                token.setup_token_id,
                token.user_id,
                token.business_id
            ]
        );


        await connection.commit();


        return res.json({
            success: true,
            message: "Your password has been created successfully.",
            redirect: "/login"
        });

    } catch (error) {

        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error(
                    "Employee setup rollback error:",
                    rollbackError
                );
            }
        }

        console.error("Complete employee setup error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to complete account setup."
        });

    } finally {

        if (connection) {
            connection.release();
        }
    }
};



exports.register=async(req,res)=>{
    const {firstName,lastName,email,jobTitle,phone,RoleName,business_id,branch_id,password,confirmPassword}=req.body;
    const formData={firstName:firstName||"",lastName:lastName||"",email:email||"",jobTitle:jobTitle||"",phone:phone||"",RoleName:RoleName||"",business_id:business_id||"",branch_id:branch_id||""};
    const renderRegistrationError=async(message)=>{
        try{
            const [businesses]=await db.query(`SELECT business_id,business_name,address,city FROM businesses WHERE is_active=1 ORDER BY business_name ASC`);
            const [branches]=await db.query(`SELECT branch_id,business_id,branch_name,location FROM branches WHERE is_active=1 ORDER BY branch_name ASC`);
            return res.render("Account",{...formData,businesses,branches,message});
        }catch(error){
            console.error("Unable to reload registration form:",error);
            return res.status(500).send("Unable to load the registration form.");
        }
    };
    const cleanFirstName=(firstName||"").trim();
    const cleanLastName=(lastName||"").trim();
    const cleanEmail=(email||"").trim().toLowerCase();
    const cleanJobTitle=(jobTitle||"").trim();
    const cleanPhone=(phone||"").trim();
    if(!cleanFirstName||!cleanLastName||!cleanEmail||!cleanJobTitle||!cleanPhone||!RoleName||!business_id||!branch_id||!password||!confirmPassword)return renderRegistrationError("Please fill all the required information.");
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))return renderRegistrationError("Please enter a valid email address.");
    if(!["Cashier","Manager","Administrator","Admin"].includes(RoleName))return renderRegistrationError("Please select a valid account role.");
    if(password.length<8)return renderRegistrationError("Password must be at least 8 characters long.");
    if(password!==confirmPassword)return renderRegistrationError("The passwords do not match.");
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const [existingUsers]=await connection.query(`SELECT UserID FROM Users WHERE Email=?`,[cleanEmail]);
        if(existingUsers.length){
            await connection.rollback();
            return renderRegistrationError("This email already exists.");
        }
        const [businesses]=await connection.query(`SELECT business_id,business_name,address,city FROM businesses WHERE business_id=? AND is_active=1`,[business_id]);
        if(!businesses.length){
            await connection.rollback();
            return renderRegistrationError("The selected business is unavailable.");
        }
        const business=businesses[0];
        const [branches]=await connection.query(`SELECT branch_id,business_id,branch_name,location FROM branches WHERE branch_id=? AND business_id=? AND is_active=1`,[branch_id,business.business_id]);
        if(!branches.length){
            await connection.rollback();
            return renderRegistrationError("The selected branch does not belong to the selected business.");
        }
        const branch=branches[0];
        const passwordHash=await bcrypt.hash(password,12);
        const [userResult]=await connection.query(`INSERT INTO Users(FirstName,LastName,JobTitle,RoleName,business_id,Business_name,Business_location,branch_id,Email,Phone,PasswordHash,IsActive) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[cleanFirstName,cleanLastName,cleanJobTitle,RoleName,business.business_id,business.business_name,branch.location,branch.branch_id,cleanEmail,cleanPhone,passwordHash,0]);
        await connection.commit();
        console.log(`Public registration created: UserID=${userResult.insertId}, BusinessID=${business.business_id}, BranchID=${branch.branch_id}, Role=${RoleName}, IsActive=0`);
        return res.render("login",{message:"Registration successful. Your account is waiting for administrator approval. You can sign in after your account has been approved.",email:cleanEmail});
    }catch(error){
        await connection.rollback();
        console.error("Public registration error:",error);
        if(error.code==="ER_DUP_ENTRY")return renderRegistrationError("This email already exists.");
        return renderRegistrationError("Unable to create the account. Please try again.");
    }finally{
        connection.release();
    }
};

exports.getRegisterPage=async(req,res)=>{
    try{
        const [businesses]=await db.query(`SELECT business_id,business_name,address,city FROM businesses WHERE is_active=1 ORDER BY business_name ASC`);
        const [branches]=await db.query(`SELECT branch_id,business_id,branch_name,location FROM branches WHERE is_active=1 ORDER BY branch_name ASC`);
        return res.render("Account",{businesses,branches});
    }catch(error){
        console.error("Registration page error:",error);
        return res.status(500).send("Unable to load the registration page.");
    }
};

exports.showRegister=async(req,res)=>{
    return exports.getRegisterPage(req,res);
};

exports.login=async(req,res)=>{
    const email=(req.body.email||"").trim().toLowerCase();
    const password=req.body.password||"";
    try{
        if(!email||!password)return res.render("login",{message:"Please enter your email and password.",email});
        const [users]=await db.query(`SELECT UserID,FirstName,LastName,JobTitle,RoleName,business_id,Business_name,Business_location,Email,Phone,PasswordHash,IsActive,branch_id FROM Users WHERE Email=?`,[email]);
        if(!users.length)return res.render("login",{message:"This email does not exist.",email});
        const user=users[0];
        if(user.IsActive!==1)return res.render("login",{message:"Your account is waiting for administrator approval or has been deactivated.",email});
        const passwordMatch=await bcrypt.compare(password,user.PasswordHash);
        if(!passwordMatch)return res.render("login",{message:"Incorrect password.",email});
        if(!user.business_id)return res.render("login",{message:"Your account is not properly associated with a business.",email});
        if (!user.PasswordHash) {
                return res.render("login", {
                    message: "Please complete your account setup before logging in.",
                    email
                });
            }
            if (!passwordMatch) {
                return res.render("login", {
                    message: "Incorrect password.",
                    email
                });
            }
        const [businesses]=await db.query(`SELECT business_id,business_name,address,city FROM businesses WHERE business_id=? AND is_active=1`,[user.business_id]);
        if(!businesses.length)return res.render("login",{message:"Your business is inactive or unavailable.",email});
        const business=businesses[0];
        let branch=null;
        if(user.branch_id!==null){
            const [branches]=await db.query(`SELECT branch_id,business_id,branch_name,location FROM branches WHERE branch_id=? AND business_id=? AND is_active=1`,[user.branch_id,user.business_id]);
            if(!branches.length)return res.render("login",{message:"Your assigned branch is inactive or invalid.",email});
            branch=branches[0];
        }
        req.session.regenerate(err=>{
            if(err){
                console.error("Session regeneration error:",err);
                return res.render("login",{message:"Unable to start your session. Please try again.",email});
            }
            req.session.user={
                id:user.UserID,
                UserID:user.UserID,
                business_id:business.business_id,
                branch_id:branch?branch.branch_id:null,
                branch_name:branch?branch.branch_name:null,
                RoleName:user.RoleName,
                name:`${user.FirstName} ${user.LastName}`,
                firstName:user.FirstName,
                lastName:user.LastName,
                email:user.Email,
                phone:user.Phone,
                Business_name:business.business_name,
                Business_location:business.address,
                Business_city:business.city
            };
            req.session.save(saveError=>{
                if(saveError){
                    console.error("Session save error:",saveError);
                    return res.render("login",{message:"Unable to start your session. Please try again.",email});
                }
                return res.redirect("/productpages/main");
            });
        });
    }catch(error){
        console.error("Login error:",error);
        return res.render("login",{message:"Problem while connecting. Please contact the administrator.",email});
    }
};

exports.logout=(req,res)=>{
    req.session.destroy(err=>{
        if(err){
            console.error("Logout error:",err);
            return res.status(500).send("Unable to log out.");
        }
        res.clearCookie("connect.sid");
        return res.redirect("/login");
    });
};

exports.getProfile=async(req,res)=>{
    try{
        if(!req.session.user)return res.status(401).json({success:false,message:"You are not logged in."});
        const userId=req.session.user.id;
        const business_id=req.session.user.business_id;
        const [users]=await db.query(`SELECT UserID,FirstName,LastName,JobTitle,RoleName,business_id,branch_id,Business_name,Business_location,Email,Phone,IsActive,CreatedAt,UpdatedAt FROM Users WHERE UserID=? AND business_id=?`,[userId,business_id]);
        if(!users.length)return res.status(404).json({success:false,message:"Profile not found."});
        return res.json({success:true,user:users[0]});
    }catch(error){
        console.error("Get profile error:",error);
        return res.status(500).json({success:false,message:"Unable to load profile."});
    }
};

exports.updateProfile=async(req,res)=>{
    try{
        if(!req.session.user)return res.status(401).json({success:false,message:"You are not logged in."});
        const userId=req.session.user.id;
        const business_id=req.session.user.business_id;
        const cleanFirstName=(req.body.firstName||"").trim();
        const cleanLastName=(req.body.lastName||"").trim();
        const cleanEmail=(req.body.email||"").trim().toLowerCase();
        const cleanPhone=(req.body.phone||"").trim();
        if(!cleanFirstName||!cleanLastName||!cleanEmail)return res.status(400).json({success:false,message:"First name, last name and email are required."});
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))return res.status(400).json({success:false,message:"Please enter a valid email address."});
        const [existingUsers]=await db.query(`SELECT UserID FROM Users WHERE Email=? AND UserID!=?`,[cleanEmail,userId]);
        if(existingUsers.length)return res.status(409).json({success:false,message:"This email is already being used by another account."});
        const [result]=await db.query(`UPDATE Users SET FirstName=?,LastName=?,Email=?,Phone=? WHERE UserID=? AND business_id=?`,[cleanFirstName,cleanLastName,cleanEmail,cleanPhone||null,userId,business_id]);
        if(result.affectedRows===0)return res.status(404).json({success:false,message:"Profile not found."});
        const [users]=await db.query(`SELECT UserID,FirstName,LastName,JobTitle,RoleName,business_id,branch_id,Business_name,Business_location,Email,Phone,IsActive,CreatedAt,UpdatedAt FROM Users WHERE UserID=? AND business_id=?`,[userId,business_id]);
        const updatedUser=users[0];
        req.session.user.name=`${updatedUser.FirstName} ${updatedUser.LastName}`;
        req.session.user.firstName=updatedUser.FirstName;
        req.session.user.lastName=updatedUser.LastName;
        req.session.user.email=updatedUser.Email;
        req.session.user.phone=updatedUser.Phone;
        return res.json({success:true,message:"Profile updated successfully.",user:updatedUser});
    }catch(error){
        console.error("Update profile error:",error);
        return res.status(500).json({success:false,message:"Unable to update profile."});
    }
};

exports.changePassword=async(req,res)=>{
    try{
        if(!req.session.user)return res.status(401).json({success:false,message:"You are not logged in."});
        const userId=req.session.user.id;
        const business_id=req.session.user.business_id;
        const {currentPassword,newPassword,confirmPassword}=req.body;
        if(!currentPassword||!newPassword||!confirmPassword)return res.status(400).json({success:false,message:"Please fill in all password fields."});
        if(newPassword.length<8)return res.status(400).json({success:false,message:"New password must be at least 8 characters long."});
        if(newPassword!==confirmPassword)return res.status(400).json({success:false,message:"New password and confirmation password do not match."});
        const [users]=await db.query(`SELECT PasswordHash FROM Users WHERE UserID=? AND business_id=?`,[userId,business_id]);
        if(!users.length)return res.status(404).json({success:false,message:"User account not found."});
        const passwordMatch=await bcrypt.compare(currentPassword,users[0].PasswordHash);
        if(!passwordMatch)return res.status(400).json({success:false,message:"Your current password is incorrect."});
        if(await bcrypt.compare(newPassword,users[0].PasswordHash))return res.status(400).json({success:false,message:"Your new password must be different from your current password."});
        const newPasswordHash=await bcrypt.hash(newPassword,12);
        await db.query(`UPDATE Users SET PasswordHash=? WHERE UserID=? AND business_id=?`,[newPasswordHash,userId,business_id]);
        return res.json({success:true,message:"Password changed successfully."});
    }catch(error){
        console.error("Change password error:",error);
        return res.status(500).json({success:false,message:"Unable to change password. Please try again."});
    }
};