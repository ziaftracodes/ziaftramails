require('dotenv').config({ path: '.env' });
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const htmlContent = `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; color: #333; line-height: 1.7; max-width: 600px;">
    <p>Hi team,</p>
    <p>I loved how your team at Rule42 elevated PepsiCo's brand identity with a bold and modern approach that resonated with a wider audience.</p>
    <p>I'm a full-stack developer (React, Next.js, Node.js) reaching out to see if <strong>Studio Mega</strong> ever works with external development partners during busy periods.</p>
    <p>My entire focus is partnering with established digital agencies to handle their paid overflow and outsourcing work on a project or contract basis.</p>
    <p>If your internal team ever gets overloaded or you need to offload web applications, API integrations, or frontend/backend implementation, I would love to be your go-to external partner.</p>
    <p>I know it's risky to trust a new developer with your client work. That's why I'm happy to do a <strong>completely free, fixed-scope trial task</strong> — literally any kind of work you want to throw at me — just so you can evaluate my code quality and communication firsthand.</p>
    <p>You can check out my portfolio here: <strong><a href="https://fayzz.in" style="color: #2563eb;">fayzz.in</a></strong></p>
    <p>If you're open to an external partnership — or if you just want to test me out with a free task this week — I'd love to chat.</p>
    <p style="margin-top: 24px;">
        Best,<br>
        <strong>Fayz</strong><br>
        <span style="color: #666;">Full-Stack Developer</span><br>
        <a href="https://fayzz.in" style="color: #2563eb;">fayzz.in</a>
    </p>
</div>`;

async function send() {
    console.log("🚀 Firing email to jobs@studiomega.com via Resend...");
    
    try {
        const { data, error } = await resend.emails.send({
            from: `Fayz <${process.env.SENDER_EMAIL}>`,
            to: ['jobs@studiomega.com'],
            subject: 'Extra development capacity for Studio Mega',
            html: htmlContent,
        });

        if (error) {
            console.error("❌ Failed to send:", error);
            return;
        }

        console.log("✅ Email successfully sent!");
        console.log("Response:", data);
    } catch (e) {
        console.error("❌ Error:", e);
    }
}

send();
