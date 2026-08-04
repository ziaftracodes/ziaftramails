require('dotenv').config();

async function sendTestEmail() {
    console.log("🚀 Attempting to send a test email via Brevo...");
    
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sender: { email: process.env.SENDER_EMAIL, name: 'Ziaftra' },
                to: [{ email: 'ziaftra@gmail.com', name: 'Ziaftra Test' }],
                subject: 'Test from Ziaftra Mails 🚀 (Brevo)',
                htmlContent: '<h1>It works!</h1><p>The Brevo API integration is fully operational.</p>'
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("❌ Brevo API Error:", JSON.stringify(err, null, 2));
            return;
        }

        const data = await response.json();
        console.log("✅ Success! Email sent via Brevo. ID:", data.messageId);
    } catch (err) {
        console.error("❌ Unexpected Error:", err.message);
    }
}

sendTestEmail();
