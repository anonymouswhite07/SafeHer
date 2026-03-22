const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// ⚠️ REPLACE THIS WITH YOUR REAL GUARDIAN PHONE NUMBER
// Must include country code, e.g. "+91XXXXXXXXXX" for India or "+1XXXXXXXXXX" for US
const TEST_TARGET_NUMBER = '+916381716235'; 

async function runSMSTest() {
    console.log('--------------------------------------------------');
    console.log('🚀 Initiating SafeHer Twilio SMS Integration Test');
    console.log(`📡 Sending from: ${twilioPhone}`);
    console.log(`🎯 Target Number: ${TEST_TARGET_NUMBER}`);
    console.log('--------------------------------------------------');

    try {
        if (TEST_TARGET_NUMBER === '+1234567890') {
            console.warn('❌ ERROR: You must edit test-sms.js and insert your real phone number on line 10!');
            return;
        }

        const message = await client.messages.create({
            body: "🚨 SafeHer Test: This is a diagnostic emergency SMS from your Twilio backend. If you received this, your Node.js server SMS module is working perfectly!",
            from: twilioPhone,
            to: TEST_TARGET_NUMBER
        });
        
        console.log('✅ SMS Sent Successfully!');
        console.log(`📝 Receipt SID: ${message.sid}`);
    } catch (err) {
        console.error('\n❌ TWILIO SMS FAILED:');
        console.error(err.message);
        console.error('\nTroubleshooting:');
        console.error('1. Check if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct in your .env file.');
        console.error('2. Ensure the Target Number is verified in your Twilio account if you are using a Trial Account.');
        console.error('3. Ensure the phone number format includes the country code (e.g. +91).');
    }
}

runSMSTest();
