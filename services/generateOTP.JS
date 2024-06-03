
const otpGenerator=require("otp-generator");


const generateOTP=()=>{
 const OTP=otpGenerator.generate(4,{
    upperCaseAlphabets:false,
    specialChars:false,
 });
 return OTP;
}
module.exports=generateOTP();
