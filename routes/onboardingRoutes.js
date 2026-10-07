const express = require('express');
const router = express.Router();

const onboardingController = require('../controllers/onboardingController');

// Show the business registration/onboarding page
router.get('/register-business', onboardingController.showOnboarding);

// Submit business registration
router.post('/register-business', onboardingController.registerBusiness);

module.exports = router;