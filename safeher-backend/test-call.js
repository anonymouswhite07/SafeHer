const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

const client = twilio(accountSid, authToken);

// Automatically using the phone number you tested with earlier
const TEST_TARGET_NUMBER = '+916381716235'; 

async function runCallTest() {
    console.log('--------------------------------------------------');
    console.log('🚀 Initiating SafeHer Twilio AI Voice Call Test');
    console.log(`📡 Calling from: ${twilioPhone}`);
    console.log(`🎯 Target Number: ${TEST_TARGET_NUMBER}`);
    console.log('--------------------------------------------------');

    const message = `Hello, this is a diagnostic message from SafeHer A I. ... 
    Your Twilio programmable voice module is working perfectly. ... 
    The audio connection has been successfully established. ... 
    Goodbye.`;

    try {
        const call = await client.calls.create({
            to: TEST_TARGET_NUMBER,
            from: twilioPhone,
            twiml: `<Response><Say voice="alice">${message}</Say></Response>`
        });
        
        console.log('✅ Phone Call Initiated Successfully!');
        console.log(`📝 Call SID: ${call.sid}`);
        console.log('⏳ Your phone should begin ringing within the next 3 to 5 seconds.');
    } catch (err) {
        console.error('\n❌ TWILIO CALL FAILED:');
        console.error(err.message);
    }
}

runCallTest();
