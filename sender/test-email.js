require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
    console.log("🚀 Attempting to send a test email via Resend...");
    try {
        const { data, error } = await resend.emails.send({
            from: 'Fayz <hello@fayzz.in>',
            to: ['ziaftra.codes@gmail.com'],
            subject: 'Extra development capacity for your agency',
            html: `
                <p>Hi there,</p>
                <p>I was just looking at your website and I absolutely love the recent web development projects you've launched. The clean UI design on your portfolio is really impressive!</p>
                <p>I know many digital marketing agencies are turning down client work right now because their internal dev teams are at full capacity. I run a specialized Next.js and React development studio, and we partner with agencies just like yours to handle overflow work (white-labeled as your own team).</p>
                <p>If you're currently turning away clients or dealing with a backlog, I'd love to chat about how we can take that development burden off your plate so you can focus on closing deals.</p>
                <p>Are you open to a quick 10-minute chat this week?</p>
                <p>Best,<br>Fayz<br>Ziaftra Devs<br><a href="https://fayzz.in">fayzz.in</a></p>
            `
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
