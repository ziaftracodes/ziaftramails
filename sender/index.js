require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Initialize clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

async function getDynamicLimit() {
    // Check the database to see when we sent our VERY FIRST email
    const { data: firstSent, error } = await supabase
        .from('agencies')
        .select('last_contacted_at')
        .not('last_contacted_at', 'is', null)
        .order('last_contacted_at', { ascending: true })
        .limit(1);

    if (error) {
        console.warn("⚠️ Could not check warmup history. Defaulting to safe limit of 50.");
        return 50;
    }

    if (!firstSent || firstSent.length === 0) {
        console.log("🌱 First day of outreach! Starting Warm-up Phase 1.");
        return 50;
    }

    const startDate = new Date(firstSent[0].last_contacted_at);
    const today = new Date();
    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    console.log(`🔥 Warm-up Status: Day ${diffDays + 1} since first email.`);

    if (diffDays < 7) return 50;        // Week 1: Very safe
    if (diffDays < 14) return 100;      // Week 2: Ramping up
    if (diffDays < 21) return 300;      // Week 3: Getting warm
    if (diffDays < 28) return 500;      // Week 4: Almost there
    return 700;                         // Week 5+: Fully unlocked (Max Free Tier)
}

// Helper functions for providers
async function sendViaBrevo(toEmail, toName, htmlContent) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: 'Fayz', email: process.env.SENDER_EMAIL },
            to: [{ email: toEmail, name: toName }],
            subject: `Extra development capacity for ${toName}`,
            htmlContent: htmlContent
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Brevo Error: ${JSON.stringify(err)}`);
    }
}

async function sendViaMailjet(toEmail, toName, htmlContent) {
    const auth = Buffer.from(process.env.MAILJET_API_KEY + ':' + process.env.MAILJET_API_SECRET).toString('base64');
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth },
        body: JSON.stringify({
            Messages: [{
                From: { Email: process.env.SENDER_EMAIL, Name: 'Fayz' },
                To: [{ Email: toEmail, Name: toName }],
                Subject: `Extra development capacity for ${toName}`,
                HTMLPart: htmlContent
            }]
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Mailjet Error: ${JSON.stringify(err)}`);
    }
}

async function sendViaMailgun(toEmail, toName, htmlContent) {
    const domain = process.env.MAILGUN_DOMAIN;
    const auth = Buffer.from('api:' + process.env.MAILGUN_API_KEY).toString('base64');
    const formData = new URLSearchParams();
    formData.append('from', `Fayz <${process.env.SENDER_EMAIL}>`);
    formData.append('to', toEmail);
    formData.append('subject', `Extra development capacity for ${toName}`);
    formData.append('html', htmlContent);

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: { 'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Mailgun Error: ${JSON.stringify(err)}`);
    }
}

async function runSender() {
    console.log('🚀 Starting Ziaftra Mails - Mega Load Balancer...');

    try {
        // Calculate dynamic limit based on warm up schedule (can be overridden by .env for emergency)
        const overrideLimit = parseInt(process.env.DAILY_LIMIT, 10);
        const DAILY_LIMIT = overrideLimit || await getDynamicLimit();

        console.log(`\n🔍 Fetching up to ${DAILY_LIMIT} PENDING leads based on current Warm-up schedule...`);
        const { data: leads, error } = await supabase
            .from('agencies')
            .select('*')
            .eq('status', 'PENDING')
            .limit(DAILY_LIMIT);

        if (error) throw error;
        if (!leads || leads.length === 0) {
            console.log('✅ No pending leads found. Everything is up to date.');
            return;
        }

        console.log(`🎯 Found ${leads.length} leads. Beginning sequence...`);

        let counts = { resend: 0, brevo: 0, mailjet: 0, mailgun: 0 };

        for (const [index, agency] of leads.entries()) {
            console.log(`\n📨 [${index + 1}/${leads.length}] Target: ${agency.name} (${agency.email})`);

            const htmlContent = `
                <p>Hi team at ${agency.name},</p>
                <p>My name is Fayz, I'm a full-stack developer based in India.</p>
                <p>I’m reaching out because I work with agencies that sometimes need extra development support when their internal team gets busy.</p>
                <p>If your team ever needs help with overflow work or full-stack implementation (React, Next.js, Node.js, PostgreSQL), I would love to be considered as an external development partner. I’m not looking for a full-time role—just to be an extra pair of hands when you need them.</p>
                <p>If you're open to it, I'd love to send over my portfolio. I'm also happy to do a small fixed-scope trial task so you can see how I work in a real project environment.</p>
                <p>Best regards,<br><strong>Fayz</strong><br>Full-Stack Developer</p>
            `;

            try {
                if (counts.resend < 100) {
                    console.log(`📡 Routing via: RESEND (Usage: ${counts.resend + 1}/100)`);
                    const { error: resendError } = await resend.emails.send({
                        from: `Fayz <${process.env.SENDER_EMAIL}>`,
                        to: [agency.email],
                        subject: `Extra development capacity for ${agency.name}`,
                        html: htmlContent,
                    });
                    if (resendError) throw new Error(resendError.message);
                    counts.resend++;
                } 
                else if (counts.brevo < 300) {
                    console.log(`📡 Routing via: BREVO (Usage: ${counts.brevo + 1}/300)`);
                    await sendViaBrevo(agency.email, agency.name, htmlContent);
                    counts.brevo++;
                } 
                else if (counts.mailjet < 200) {
                    console.log(`📡 Routing via: MAILJET (Usage: ${counts.mailjet + 1}/200)`);
                    await sendViaMailjet(agency.email, agency.name, htmlContent);
                    counts.mailjet++;
                } 
                else if (counts.mailgun < 100) {
                    console.log(`📡 Routing via: MAILGUN (Usage: ${counts.mailgun + 1}/100)`);
                    await sendViaMailgun(agency.email, agency.name, htmlContent);
                    counts.mailgun++;
                } 

                // Update Database to SENT
                await supabase
                    .from('agencies')
                    .update({ status: 'SENT', last_contacted_at: new Date().toISOString() })
                    .eq('id', agency.id);

                console.log(`✅ Success & Database updated -> Status: SENT`);

            } catch (err) {
                console.error(`❌ Failed to send to ${agency.email}:`, err.message);
            }

            // Humanize sending speed
            if (index < leads.length - 1) {
                const waitTimeMs = randomDelay(60000, 180000); 
                console.log(`⏳ Humanizing delay... Waiting ${Math.round(waitTimeMs / 1000)}s`);
                await sleep(waitTimeMs);
            }
        }

        const totalSent = counts.resend + counts.brevo + counts.mailjet + counts.mailgun;
        console.log(`\n🎉 Daily outreach complete! Total sent today: ${totalSent}`);

    } catch (err) {
        console.error('❌ Fatal Error:', err.message);
    }
}

runSender();
