require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
    console.log("🚀 Attempting to send a test email via Resend...");
    try {
        const { data, error } = await resend.emails.send({
            from: 'Ziaftra <hello@fayzz.in>',
            to: ['ziaftra@gmail.com'],
            subject: 'Test from Ziaftra Mails 🚀',
            html: '<h1>It works!</h1><p>The Resend API integration is fully operational.</p>'
        });

        if (error) {
            console.error("❌ Resend API Error:", error.message);
            return;
        }

        console.log("✅ Success! Email sent. ID:", data.id);
    } catch (err) {
        console.error("❌ Unexpected Error:", err.message);
    }
}

sendTestEmail();
