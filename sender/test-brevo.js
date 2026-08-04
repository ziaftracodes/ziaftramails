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
                sender: { email: process.env.SENDER_EMAIL, name: 'Fayz' },
                to: [{ email: 'techfki@gmail.com', name: 'Ziaftra Codes' }],
                subject: 'Extra development capacity for your agency',
                htmlContent: `
                <p>Hi team,</p>
                <p>I was just looking at your agency's website and I absolutely love the recent web development projects you've launched.</p>
                <p>I'm a full-stack developer (React, Next.js, Node.js) reaching out to see if Ziaftra Codes ever works with external development partners during busy periods.</p>
                <p>My entire focus is partnering with established digital agencies to handle their paid overflow and outsourcing work on a project or contract basis.</p>
                <p>If your internal team ever gets overloaded or you need to offload web applications, API integrations, or frontend/backend implementation, I would love to be your go-to external partner.</p>
                <p>I know it is risky to trust a new developer with your client work. That is why I am happy to do a completely free, fixed-scope trial task—<b>literally any kind of work you want to throw at me</b>—just so you can evaluate my code quality and communication firsthand.</p>
                <p>You can check out my portfolio here: <b><a href="https://fayzz.in">https://fayzz.in</a></b></p>
                <p>If you are open to an external partnership—or if you just want to test me out with a free task this week—I'd love to chat.</p>
                <p>Best,<br>Fayz<br>Full-Stack Developer<br><a href="https://fayzz.in">fayzz.in</a></p>
                `
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
