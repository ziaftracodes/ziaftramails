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

// Removed Mailgun

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
                <p>Hi team,</p>
                <p>${agency.personalized_intro || ''}</p>
                <p>I'm a full-stack developer (React, Next.js, Node.js) reaching out to see if ${agency.name} ever works with external development partners during busy periods.</p>
                <p>My entire focus is partnering with established digital agencies to handle their paid overflow and outsourcing work on a project or contract basis.</p>
                <p>If your internal team ever gets overloaded or you need to offload web applications, API integrations, or frontend/backend implementation, I would love to be your go-to external partner.</p>
                <p>I know it is risky to trust a new developer with your client work. That is why I am happy to do a completely free, fixed-scope trial task—<b>literally any kind of work you want to throw at me</b>—just so you can evaluate my code quality and communication firsthand.</p>
                <p>You can check out my portfolio here: <b><a href="https://fayzz.in">https://fayzz.in</a></b></p>
                <p>If you are open to an external partnership—or if you just want to test me out with a free task this week—I'd love to chat.</p>
                <p>Best,<br>Fayz<br>Full-Stack Developer<br><a href="https://fayzz.in">fayzz.in</a></p>
            `;

            try {
                // MEGA LOAD BALANCER
                const isDryRun = process.env.DRY_RUN === 'true';

                if (counts.resend < 100) {
                    console.log(`📡 Routing via: RESEND (Usage: ${counts.resend + 1}/100)`);
                    if (!isDryRun) {
                        const { error: resendError } = await resend.emails.send({
                            from: `Fayz <${process.env.SENDER_EMAIL}>`,
                            to: [agency.email],
                            subject: `Extra development capacity for ${agency.name}`,
                            html: htmlContent,
                        });
                        if (resendError) throw new Error(resendError.message);
                    } else { console.log(`[DRY RUN] Sent via Resend successfully.`); }
                    counts.resend++;
                } 
                else if (counts.brevo < 300) {
                    console.log(`📡 Routing via: BREVO (Usage: ${counts.brevo + 1}/300)`);
                    if (!isDryRun) await sendViaBrevo(agency.email, agency.name, htmlContent);
                    else console.log(`[DRY RUN] Sent via Brevo successfully.`);
                    counts.brevo++;
                } 
                /*
                else if (counts.mailjet < 200) {
                    console.log(`📡 Routing via: MAILJET (Usage: ${counts.mailjet + 1}/200)`);
                    if (!isDryRun) await sendViaMailjet(agency.email, agency.name, htmlContent);
                    else console.log(`[DRY RUN] Sent via Mailjet successfully.`);
                    counts.mailjet++;
                } 
                */
                else {
                    console.log(`🛑 Daily limits reached across ALL 2 active providers (Total 400). Stopping.`);
                    break; 
                }

                // Update Database to SENT (Even in Dry Run so we can see the DB change)
                await supabase
                    .from('agencies')
                    .update({ status: 'SENT', last_contacted_at: new Date().toISOString() })
                    .eq('id', agency.id);

                console.log(`✅ Success & Database updated -> Status: SENT`);

            } catch (err) {
                console.error(`❌ Failed to send to ${agency.email}:`, err.message);
            }

            // Humanize sending speed (Speed it up massively if it's a Dry Run)
            if (index < leads.length - 1) {
                const isDryRun = process.env.DRY_RUN === 'true';
                const waitTimeMs = isDryRun ? 50 : randomDelay(60000, 180000); 
                if(!isDryRun) console.log(`⏳ Humanizing delay... Waiting ${Math.round(waitTimeMs / 1000)}s`);
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
