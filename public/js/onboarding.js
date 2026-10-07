document.addEventListener('DOMContentLoaded', () => {


// ==========================================
// ONBOARDING STATE
// ==========================================

let currentStep = 1;

const totalSteps = 7;

const formData = {};


// ==========================================
// ELEMENTS
// ==========================================

const steps = document.querySelectorAll('.step');

const progressFill = document.getElementById('progressFill');

const stepLabel = document.getElementById('stepLabel');

const stepNumber = document.getElementById('stepNumber');

const formMessage = document.getElementById('formMessage');

const createBusinessBtn =
    document.getElementById('createBusinessBtn');


// ==========================================
// STEP LABELS
// ==========================================

const stepLabels = {
    1: 'Welcome',
    2: 'About You',
    3: 'Business Registration',
    4: 'Business Information',
    5: 'First Branch',
    6: 'Owner Account',
    7: 'Review'
};


// ==========================================
// SHOW STEP
// ==========================================

function showStep(stepNumberValue) {

    steps.forEach(step => {
        step.classList.remove('active');
    });

    const targetStep =
        document.querySelector(
            `.step[data-step="${stepNumberValue}"]`
        );

    if (!targetStep) {
        return;
    }

    targetStep.classList.add('active');

    currentStep = stepNumberValue;

    updateProgress();

    clearMessage();

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}


// ==========================================
// UPDATE PROGRESS
// ==========================================

function updateProgress() {

    const percentage =
        ((currentStep - 1) / (totalSteps - 1)) * 100;

    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    if (stepLabel) {
        stepLabel.textContent =
            stepLabels[currentStep] || 'MarketFlow';
    }

    if (stepNumber) {
        stepNumber.textContent =
            `${currentStep} / ${totalSteps}`;
    }
}


// ==========================================
// MESSAGE HANDLING
// ==========================================

function showMessage(message, type = 'error') {

    if (!formMessage) {
        return;
    }

    formMessage.textContent = message;

    formMessage.className =
        `form-message ${type}`;

    formMessage.style.display = 'block';
}


function clearMessage() {

    if (!formMessage) {
        return;
    }

    formMessage.textContent = '';

    formMessage.className = 'form-message';

    formMessage.style.display = 'none';
}


// ==========================================
// INPUT HELPERS
// ==========================================

function getValue(id) {

    const element = document.getElementById(id);

    if (!element) {
        return '';
    }

    return element.value.trim();
}


// ==========================================
// VALIDATE BUSINESS INFORMATION
// ==========================================

function validateBusinessInformation() {

    const businessName = getValue('business_name');

    if (!businessName) {

        showMessage(
            'Please enter your business name.'
        );

        document.getElementById('business_name')?.focus();

        return false;
    }

    return true;
}


// ==========================================
// VALIDATE BRANCH INFORMATION
// ==========================================

function validateBranchInformation() {

    const branchName = getValue('branch_name');

    if (!branchName) {

        showMessage(
            'Please enter the name of your first branch.'
        );

        document.getElementById('branch_name')?.focus();

        return false;
    }

    return true;
}


// ==========================================
// VALIDATE OWNER INFORMATION
// ==========================================

function validateOwnerInformation() {

    const firstName = getValue('first_name');

    const lastName = getValue('last_name');

    const email = getValue('owner_email');

    const password = getValue('password');

    const confirmPassword =
        getValue('confirm_password');


    if (!firstName) {

        showMessage(
            'Please enter your first name.'
        );

        document.getElementById('first_name')?.focus();

        return false;
    }


    if (!lastName) {

        showMessage(
            'Please enter your last name.'
        );

        document.getElementById('last_name')?.focus();

        return false;
    }


    if (!email) {

        showMessage(
            'Please enter your email address.'
        );

        document.getElementById('owner_email')?.focus();

        return false;
    }


    if (!isValidEmail(email)) {

        showMessage(
            'Please enter a valid email address.'
        );

        document.getElementById('owner_email')?.focus();

        return false;
    }


    if (!password) {

        showMessage(
            'Please create a password.'
        );

        document.getElementById('password')?.focus();

        return false;
    }


    if (password.length < 8) {

        showMessage(
            'Your password must contain at least 8 characters.'
        );

        document.getElementById('password')?.focus();

        return false;
    }


    if (!confirmPassword) {

        showMessage(
            'Please confirm your password.'
        );

        document
            .getElementById('confirm_password')
            ?.focus();

        return false;
    }


    if (password !== confirmPassword) {

        showMessage(
            'The passwords do not match.'
        );

        document
            .getElementById('confirm_password')
            ?.focus();

        return false;
    }


    return true;
}


// ==========================================
// EMAIL VALIDATION
// ==========================================

function isValidEmail(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ==========================================
// COLLECT FORM DATA
// ==========================================

function collectFormData() {

    formData.business_name =
        getValue('business_name');

    formData.business_phone =
        getValue('business_phone');

    formData.business_email =
        getValue('business_email');

    formData.business_address =
        getValue('business_address');

    formData.business_city =
        getValue('business_city');


    formData.branch_name =
        getValue('branch_name');

    formData.branch_location =
        getValue('branch_location');

    formData.branch_phone =
        getValue('branch_phone');


    formData.first_name =
        getValue('first_name');

    formData.last_name =
        getValue('last_name');

    formData.owner_email =
        getValue('owner_email');

    formData.owner_phone =
        getValue('owner_phone');

    formData.password =
        getValue('password');

    formData.confirm_password =
        getValue('confirm_password');
}


// ==========================================
// UPDATE REVIEW SCREEN
// ==========================================

function updateReview() {

    collectFormData();


    // Business

    setReviewValue(
        'reviewBusinessName',
        formData.business_name
    );

    setReviewValue(
        'reviewBusinessPhone',
        formData.business_phone
    );

    setReviewValue(
        'reviewBusinessEmail',
        formData.business_email
    );

    setReviewValue(
        'reviewBusinessAddress',
        formData.business_address
    );

    setReviewValue(
        'reviewBusinessCity',
        formData.business_city
    );


    // Branch

    setReviewValue(
        'reviewBranchName',
        formData.branch_name
    );

    setReviewValue(
        'reviewBranchLocation',
        formData.branch_location
    );

    setReviewValue(
        'reviewBranchPhone',
        formData.branch_phone
    );


    // Owner

    const ownerName =
        `${formData.first_name} ${formData.last_name}`.trim();

    setReviewValue(
        'reviewOwnerName',
        ownerName
    );

    setReviewValue(
        'reviewOwnerEmail',
        formData.owner_email
    );
}


function setReviewValue(id, value) {

    const element = document.getElementById(id);

    if (!element) {
        return;
    }

    element.textContent =
        value && value.trim()
            ? value
            : 'Not provided';
}


// ==========================================
// NEXT BUTTONS
// ==========================================

document.querySelectorAll('.next-btn')
    .forEach(button => {

        button.addEventListener('click', () => {

            clearMessage();


            // Step 1 → Step 2

            if (currentStep === 1) {

                showStep(2);

                return;
            }


            // Step 2 → Step 3

            if (currentStep === 2) {

                const ownerChoice =
                    document.querySelector(
                        '[data-owner-choice].selected-choice'
                    );

                if (!ownerChoice) {

                    showMessage(
                        'Please confirm that you are the business owner.'
                    );

                    return;
                }

                showStep(3);

                return;
            }


            // Step 3 → Step 4

            if (currentStep === 3) {

                const registrationChoice =
                    document.querySelector(
                        '[data-register].selected-choice'
                    );

                if (!registrationChoice) {

                    showMessage(
                        'Please confirm that you want to register your business.'
                    );

                    return;
                }

                showStep(4);

                return;
            }


            // Step 4 → Step 5

            if (currentStep === 4) {

                if (!validateBusinessInformation()) {
                    return;
                }

                showStep(5);

                return;
            }


            // Step 5 → Step 6

            if (currentStep === 5) {

                if (!validateBranchInformation()) {
                    return;
                }

                showStep(6);

                return;
            }


            // Step 6 → Step 7

            if (currentStep === 6) {

                if (!validateOwnerInformation()) {
                    return;
                }

                updateReview();

                showStep(7);

                return;
            }

        });

    });


// ==========================================
// BACK BUTTONS
// ==========================================

document.querySelectorAll('.back-btn')
    .forEach(button => {

        button.addEventListener('click', () => {

            clearMessage();

            if (currentStep > 1) {
                showStep(currentStep - 1);
            }

        });

    });


// ==========================================
// CHOICE CARDS
// ==========================================

document.querySelectorAll('.choice-card')
    .forEach(card => {

        card.addEventListener('click', () => {

            const parent =
                card.closest('.choice-container');

            if (parent) {

                parent
                    .querySelectorAll('.choice-card')
                    .forEach(item => {
                        item.classList.remove(
                            'selected-choice'
                        );
                    });
            }

            card.classList.add('selected-choice');

            clearMessage();
        });

    });


// ==========================================
// FINAL BUSINESS REGISTRATION
// ==========================================

if (createBusinessBtn) {

    createBusinessBtn.addEventListener(
        'click',
        registerBusiness
    );
}


async function registerBusiness() {

    clearMessage();

    collectFormData();


    // Final validation

    if (!validateBusinessInformation()) {

        showStep(4);

        return;
    }


    if (!validateBranchInformation()) {

        showStep(5);

        return;
    }


    if (!validateOwnerInformation()) {

        showStep(6);

        return;
    }


    // Disable button

    const originalText =
        createBusinessBtn.textContent;

    createBusinessBtn.disabled = true;

    createBusinessBtn.textContent =
        'Creating Your Business...';


    try {

        const response = await fetch(
            '/register-business',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify(formData)
            }
        );


        let result;

        try {

            result = await response.json();

        } catch (jsonError) {

            throw new Error(
                'The server returned an invalid response.'
            );
        }


        if (!response.ok || !result.success) {

            throw new Error(
                result.message ||
                'Unable to complete registration.'
            );
        }


        // Registration succeeded

        showMessage(
            result.message ||
            'Your business has been registered successfully.',
            'success'
        );


        createBusinessBtn.textContent =
            'Registration Complete';


        // Redirect to owner portal

        setTimeout(() => {

            if (result.redirect) {

                window.location.href =
                    result.redirect;

            }

        }, 1200);


    } catch (error) {

        console.error(
            'Registration error:',
            error
        );


        showMessage(
            error.message ||
            'Something went wrong while creating your business.'
        );


        createBusinessBtn.disabled = false;

        createBusinessBtn.textContent =
            originalText;
    }

}


// ==========================================
// PREVENT ACCIDENTAL FORM SUBMISSION
// ==========================================

document.addEventListener(
    'keydown',
    event => {

        if (
            event.key === 'Enter' &&
            currentStep !== 7
        ) {

            const activeElement =
                document.activeElement;

            if (
                activeElement &&
                (
                    activeElement.tagName ===
                    'INPUT' ||
                    activeElement.tagName ===
                    'TEXTAREA'
                )
            ) {

                event.preventDefault();
            }

        }

    }
);


// ==========================================
// PASSWORD MATCH FEEDBACK
// ==========================================

const passwordInput =
    document.getElementById('password');

const confirmPasswordInput =
    document.getElementById('confirm_password');


function checkPasswordMatch() {

    if (
        !passwordInput ||
        !confirmPasswordInput
    ) {
        return;
    }


    if (!confirmPasswordInput.value) {

        confirmPasswordInput.classList.remove(
            'valid-input',
            'invalid-input'
        );

        return;
    }


    if (
        passwordInput.value ===
        confirmPasswordInput.value
    ) {

        confirmPasswordInput.classList.add(
            'valid-input'
        );

        confirmPasswordInput.classList.remove(
            'invalid-input'
        );

    } else {

        confirmPasswordInput.classList.add(
            'invalid-input'
        );

        confirmPasswordInput.classList.remove(
            'valid-input'
        );
    }

}


if (passwordInput) {

    passwordInput.addEventListener(
        'input',
        checkPasswordMatch
    );
}


if (confirmPasswordInput) {

    confirmPasswordInput.addEventListener(
        'input',
        checkPasswordMatch
    );
}


// ==========================================
// INITIALIZE
// ==========================================

showStep(1);


});
