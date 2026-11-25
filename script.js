const PACKAGES=[
{name:"5 GB",validity:"1 day",price:"$0.25"},
{name:"10 GB",validity:"3 days",price:"$0.80"},
{name:"20 GB",validity:"7 days",price:"$1.20"},
{name:"40 GB",validity:"7 days",price:"$2.00"},
{name:"80 GB",validity:"21 days",price:"$2.25"},
{name:"120 GB",validity:"30 days",price:"$3.00"},
{name:"Unlimited",validity:"30 days",price:"$8.00"}];

let selectedPackage=null,otpTimer=null,secondsLeft=0;
const $=id=>document.getElementById(id);

function showPage(id){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 $(id).classList.add("active");
 window.scrollTo({top:0,behavior:"smooth"});
}

function renderPackages(){
 const list=$("packageList");
 list.innerHTML="";
 PACKAGES.forEach((pkg,index)=>{
  const button=document.createElement("button");
  button.type="button";
  button.className="package-btn";
  button.innerHTML='<div class="package-top"><span>'+pkg.name+'</span><span class="price">'+pkg.price+'</span></div><div class="package-bottom"><span>Validity</span><span>'+pkg.validity+'</span></div>';
  button.addEventListener("click",()=>selectPackage(index));
  list.appendChild(button);
 });
}

function selectPackage(index){
 selectedPackage=PACKAGES[index];
 $("pinPackage").innerHTML=selectedPackage.name+" — "+selectedPackage.price+' <span style="font-weight:400">('+selectedPackage.validity+')</span>';
 clearErrors();
 $("phone").value="";
 $("pin").value="";
 showPage("pinPage");
 $("phone").focus();
}

function clearErrors(){
 ["phone","pin","otp"].forEach(id=>$(id).classList.remove("input-error"));
 ["phoneError","pinError","otpError"].forEach(id=>$(id).textContent="");
 $("pinStatus").textContent="";
 $("otpStatus").textContent="";
}

function validPhone(){return /^9\d{8}$/.test($("phone").value.trim())}
function valid4Digits(v){return /^\d{4}$/.test(v.trim())}

$("pinContinue").addEventListener("click",()=>{
 clearErrors();
 if(!validPhone()){
  $("phone").classList.add("input-error");
  $("phoneError").textContent="Enter exactly 9 digits starting with 9.";
  $("phone").focus();
  return;
 }
 if(!valid4Digits($("pin").value)){
  $("pin").classList.add("input-error");
  $("pinError").textContent="Enter exactly 4 digits.";
  $("pin").focus();
  return;
 }
 $("pinStatus").textContent="Waiting for verification...";
 $("otpPackage").innerHTML=selectedPackage.name+" — "+selectedPackage.price+' <span style="font-weight:400">('+selectedPackage.validity+')</span>';
 showPage("otpPage");
 startOtpTimer();
});

function startOtpTimer(){
 clearInterval(otpTimer);
 secondsLeft=60;
 $("otp").value="";
 $("otp").classList.remove("input-error");
 $("otpError").textContent="";
 $("expiredText").textContent="";
 $("otpVerify").classList.remove("hidden");
 $("requestOtp").classList.add("hidden");
 updateTimer();
 otpTimer=setInterval(()=>{
  secondsLeft--;
  updateTimer();
  if(secondsLeft<=0) expireOtp();
 },1000);
}

function updateTimer(){
 const m=String(Math.floor(secondsLeft/60)).padStart(2,"0");
 const s=String(secondsLeft%60).padStart(2,"0");
 $("timer").textContent=m+":"+s;
}

function expireOtp(){
 clearInterval(otpTimer);
 secondsLeft=0;
 updateTimer();
 $("otp").classList.add("input-error");
 $("otpError").textContent="OTP expired. Request another OTP.";
 $("expiredText").textContent="Your OTP has expired.";
 $("otpVerify").classList.add("hidden");
 $("requestOtp").classList.remove("hidden");
}

$("requestOtp").addEventListener("click",()=>{
 $("otpStatus").textContent="A new OTP request has been submitted.";
 console.log("Demo notice: customer requested another OTP.");
 startOtpTimer();
});

$("otpVerify").addEventListener("click",()=>{
 if(secondsLeft<=0){expireOtp();return}
 $("otpStatus").textContent="";
 $("otpError").textContent="";
 $("otp").classList.remove("input-error");
 if(!valid4Digits($("otp").value)){
  $("otp").classList.add("input-error");
  $("otpError").textContent="Enter exactly 4 digits.";
  $("otp").focus();
  return;
 }
 $("otpStatus").textContent="Waiting for verification...";
 $("successPackage").innerHTML=selectedPackage.name+" — "+selectedPackage.price+' <span style="font-weight:400">('+selectedPackage.validity+')</span>';
 clearInterval(otpTimer);
 showPage("successPage");
});

document.addEventListener("DOMContentLoaded",renderPackages);