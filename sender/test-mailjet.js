require('dotenv').config();

async function sendTestEmail() {
    console.log("🚀 Attempting to send a test email via Mailjet...");
    const auth = Buffer.from(`${process.env.MAILJET_API_KEY}:${process.env.MAILJET_API_SECRET}`).toString('base64');
    
    try {
        const response = await fetch('https://api.mailjet.com/v3.1/send', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Messages: [
                    {
                        From: { Email: process.env.SENDER_EMAIL, Name: 'Ziaftra' },
                        To: [{ Email: 'ziaftra@gmail.com', Name: 'Ziaftra Test' }],
                        Subject: 'Test from Ziaftra Mails 🚀 (Mailjet)',
                        HTMLPart: '<h1>It works!</h1><p>The Mailjet API integration is fully operational.</p>'
                    }
                ]
            })
        });

        if (!response.ok) {
            const err = await response.json();
            console.error("❌ Mailjet API Error:", JSON.stringify(err, null, 2));
            return;
        }

        const data = await response.json();
        console.log("✅ Success! Email sent via Mailjet.");
        console.log("Mailjet Response Status:", data.Messages[0].Status);
    } catch (err) {
        console.error("❌ Unexpected Error:", err.message);
    }
}

sendTestEmail();
