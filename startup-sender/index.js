require('dotenv').config({ path: '../sender/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// ═══════════════════════════════════════════════════════════════
// 📡 PROVIDER FUNCTION (MAILJET ONLY)
// ═══════════════════════════════════════════════════════════════
async function sendViaMailjet(toEmail, toName, subject, htmlContent) {
    const auth = Buffer.from(process.env.MAILJET_API_KEY + ':' + process.env.MAILJET_API_SECRET).toString('base64');
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + auth },
        body: JSON.stringify({
            Messages: [{
                From: { Email: process.env.SENDER_EMAIL, Name: 'Fayz' },
                To: [{ Email: toEmail, Name: toName }],
                Subject: subject,
                HTMLPart: htmlContent
            }]
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Mailjet: ${JSON.stringify(err)}`);
    }
}

// ═══════════════════════════════════════════════════════════════
// 📝 EMAIL TEMPLATE FOR STARTUP FOUNDERS
// ═══════════════════════════════════════════════════════════════
function getSubject(startupName) {
    const subjects = [
        `quick question / dev help`,
        `saw ${startupName} on my feed`,
        `shipping faster at ${startupName}`,
        `extra hands for ${startupName}`
    ];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

function buildEmailHtml(startup) {
    // Keep it extremely short, honest, and founder-focused
    return `
<p>Hey there,</p>
<p>${startup.personalized_intro || `Saw what you're building at ${startup.name} and love the concept.`}</p>
<p>I'm a full-stack dev based in India. I know early-stage teams always have a huge backlog and are looking to ship features faster.</p>
<p>If you ever need an extra pair of hands to build out MVPs, squash bugs, or handle API integrations, I can start this week.</p>
<p>Happy to do a small trial task to prove my speed. Worth a quick chat?</p>
<p>
Best,<br>
Fayz<br>
Full-Stack Developer<br>
<a href="https://fayzz.in">fayzz.in</a>
</p>`.trim();
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN SENDER
// ═══════════════════════════════════════════════════════════════
async function runSender() {
    const startTime = Date.now();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🚀 STARTUP OUTREACH SENDER`);
    console.log(`  📧 Via: Mailjet Only (200 limit)`);
    console.log(`  🏃 Mode:   ${process.env.DRY_RUN === 'true' ? 'DRY RUN' : 'LIVE'}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
        const DAILY_LIMIT = 50; // Keep it low to stay well within Mailjet's 200 free tier
        
        console.log(`🔍 Fetching up to ${DAILY_LIMIT} PENDING startups...`);
        const { data: leads, error } = await supabase
            .from('startups')
            .select('*')
            .eq('status', 'PENDING')
            .limit(DAILY_LIMIT);

        if (error) throw error;
        if (!leads || leads.length === 0) {
            console.log('✅ No pending startups found.');
            return;
        }

        console.log(`🎯 ${leads.length} startups queued. Beginning sequence...\n`);

        let totalSent = 0;
        let totalFailed = 0;

        for (const [index, startup] of leads.entries()) {
            const label = `[${index + 1}/${leads.length}]`;
            console.log(`${label} 📨 ${startup.name} → ${startup.email}`);

            const subject = getSubject(startup.name);
            const htmlContent = buildEmailHtml(startup);

            try {
                // Ensure Mailjet keys exist
                if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_API_SECRET) {
                    throw new Error("Mailjet keys missing");
                }

                if (process.env.DRY_RUN !== 'true') {
                    await sendViaMailjet(startup.email, startup.name, subject, htmlContent);
                } else {
                    console.log(`${label} [DRY RUN] Simulated send.`);
                }

                // Update database
                await supabase
                    .from('startups')
                    .update({
                        status: 'SENT',
                        last_contacted_at: new Date().toISOString(),
                        provider: 'MAILJET',
                    })
                    .eq('id', startup.id);

                console.log(`${label} ✅ SENT`);
                totalSent++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                totalFailed++;

                await supabase
                    .from('startups')
                    .update({ status: 'FAILED' })
                    .eq('id', startup.id);
            }

            // Humanized delay (60s to 120s between emails to protect domain reputation)
            if (index < leads.length - 1) {
                const waitMs = randomDelay(60000, 120000);
                console.log(`${label} ⏳ Waiting ${Math.round(waitMs / 1000)}s...\n`);
                await sleep(waitMs);
            }
        }

        // Summary
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  ✅ Sent:       ${totalSent}`);
        console.log(`  ❌ Failed:     ${totalFailed}`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
    }
}

runSender();
