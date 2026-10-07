const db=require("../Database/db");

const requireAuth=async(req,res,next)=>{
    const user=req.session?.user;

    if(!user){
        if(req.xhr||req.path.startsWith("/api/")){
            return res.status(401).json({success:false,message:"Please log in to continue."});
        }
        return res.redirect("/login");
    }

    if(!user.id||!user.business_id){
        console.error("Invalid user business context:",{
            userId:user.id,
            businessId:user.business_id,
            branchId:user.branch_id,
            role:user.RoleName
        });
        return res.status(403).json({success:false,message:"Your account does not have a valid business assignment."});
    }

    try{
        const [users]=await db.query(`
            SELECT UserID,business_id,branch_id,RoleName,IsActive
            FROM Users
            WHERE UserID=? AND business_id=?
            LIMIT 1
        `,[user.id,user.business_id]);

        if(!users.length){
            if(req.session)req.session.destroy(()=>{});
            return res.status(403).json({success:false,message:"Your account could not be verified."});
        }

        const currentUser=users[0];

        if(currentUser.IsActive!==1){
            if(req.session)req.session.destroy(()=>{});
            return res.status(403).json({success:false,message:"Your account is inactive."});
        }

        if(currentUser.business_id!==user.business_id){
            if(req.session)req.session.destroy(()=>{});
            return res.status(403).json({success:false,message:"Invalid business access."});
        }

        req.user={
            ...user,
            id:currentUser.UserID,
            UserID:currentUser.UserID,
            business_id:currentUser.business_id,
            branch_id:currentUser.branch_id,
            RoleName:currentUser.RoleName
        };

        req.session.user=req.user;

        next();
    }catch(error){
        console.error("Authentication verification error:",error);
        return res.status(500).json({success:false,message:"Unable to verify your account."});
    }
};

module.exports=requireAuth;