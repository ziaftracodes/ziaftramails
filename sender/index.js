require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Initialize clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1) + min);

// ═══════════════════════════════════════════════════════════════
// 📧 SUBJECT LINE ROTATION — Different subjects = higher open rates
// The system picks a random subject for each email so inbox
// providers don't flag us as bulk spam.
// ═══════════════════════════════════════════════════════════════
function getSubjectLine(agencyName) {
    const subjects = [
        `Extra development capacity for ${agencyName}`,
        `Overflow dev work — free trial for ${agencyName}`,
        `Quick question for ${agencyName}'s team`,
        `Partnership idea for ${agencyName}`,
        `Full-stack dev available for ${agencyName} projects`,
        `Free trial task for ${agencyName} — no strings attached`,
    ];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

// ═══════════════════════════════════════════════════════════════
// 🛡️ EMAIL VALIDATION — Don't waste sends on garbage addresses
// ═══════════════════════════════════════════════════════════════
function isValidEmail(email) {
    if (!email || email.length < 6 || email.length > 254) return false;
    const strictRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return strictRegex.test(email);
}

// ═══════════════════════════════════════════════════════════════
// 🔥 WARM-UP ENGINE — Auto-scales sending volume over time
// ═══════════════════════════════════════════════════════════════
async function getDynamicWarmupSettings() {
    const { data: firstSent, error } = await supabase
        .from('agencies')
        .select('last_contacted_at')
        .not('last_contacted_at', 'is', null)
        .order('last_contacted_at', { ascending: true })
        .limit(1);

    if (error) {
        console.warn("  ⚠️ Could not check warmup history. Defaulting to Phase 1.");
        return { limit: 50, minDelay: 60000, maxDelay: 150000 };
    }

    if (!firstSent || firstSent.length === 0) {
        console.log("  🌱 First day of outreach! Warm-up Phase 1.");
        return { limit: 50, minDelay: 60000, maxDelay: 150000 };
    }

    const startDate = new Date(firstSent[0].last_contacted_at);
    const today = new Date();
    const diffDays = Math.floor(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));

    const phases = [
        { days: 7,  limit: 50,  minDelay: 60000, maxDelay: 150000, label: 'Week 1 — Conservative' },
        { days: 14, limit: 100, minDelay: 45000, maxDelay: 120000, label: 'Week 2 — Ramping up' },
        { days: 21, limit: 200, minDelay: 30000, maxDelay: 90000,  label: 'Week 3 — Getting warm' },
        { days: 28, limit: 400, minDelay: 20000, maxDelay: 60000,  label: 'Week 4 — Almost there' },
        { days: Infinity, limit: 600, minDelay: 15000, maxDelay: 45000,  label: 'Week 5+ — Full power' },
    ];

    const phase = phases.find(p => diffDays < p.days);
    console.log(`  🔥 Day ${diffDays + 1} | ${phase.label} | Limit: ${phase.limit}`);
    return phase;
}

// ═══════════════════════════════════════════════════════════════
// 📡 PROVIDER FUNCTIONS — Multi-provider load balancer
// ═══════════════════════════════════════════════════════════════
async function sendViaResend(toEmail, toName, subject, htmlContent) {
    const { error } = await resend.emails.send({
        from: `Fayz <${process.env.SENDER_EMAIL}>`,
        to: [toEmail],
        subject: subject,
        html: htmlContent,
    });
    if (error) throw new Error(error.message);
}

async function sendViaBrevo(toEmail, toName, subject, htmlContent) {
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
            subject: subject,
            htmlContent: htmlContent
        })
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(`Brevo: ${JSON.stringify(err)}`);
    }
}

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
// 📝 EMAIL TEMPLATE — Professional, clean HTML email
// ═══════════════════════════════════════════════════════════════
function buildEmailHtml(agency) {
    return `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; color: #333; line-height: 1.7; max-width: 600px;">
    <p>Hi team,</p>
    <p>${agency.personalized_intro || ''}</p>
    <p>I'm a full-stack developer (React, Next.js, Node.js) reaching out to see if <strong>${agency.name}</strong> ever works with external development partners during busy periods.</p>
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
</div>`.trim();
}

// ═══════════════════════════════════════════════════════════════
// 🚀 MAIN SENDER ENGINE
// ═══════════════════════════════════════════════════════════════
async function runSender() {
    const startTime = Date.now();
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🚀 ZIAFTRA MAILS — MEGA LOAD BALANCER v4.0`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  📅 Date:   ${new Date().toISOString().split('T')[0]}`);
    console.log(`  📧 From:   ${process.env.SENDER_EMAIL}`);
    console.log(`  🏃 Mode:   ${process.env.DRY_RUN === 'true' ? 'DRY RUN' : 'LIVE'}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
        const overrideLimit = parseInt(process.env.DAILY_LIMIT, 10);
        const warmupSettings = await getDynamicWarmupSettings();
        const DAILY_LIMIT = overrideLimit || warmupSettings.limit;

        console.log(`\n🔍 Fetching up to ${DAILY_LIMIT} PENDING leads...`);
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

        // Filter out invalid emails before sending
        const validLeads = leads.filter(l => isValidEmail(l.email));
        const invalidLeads = leads.filter(l => !isValidEmail(l.email));

        if (invalidLeads.length > 0) {
            console.log(`\n🗑️ Marking ${invalidLeads.length} invalid email(s) as INVALID:`);
            for (const bad of invalidLeads) {
                console.log(`   ❌ ${bad.email}`);
                await supabase
                    .from('agencies')
                    .update({ status: 'INVALID' })
                    .eq('id', bad.id);
            }
        }

        if (validLeads.length === 0) {
            console.log('✅ No valid pending leads to send.');
            return;
        }

        console.log(`🎯 ${validLeads.length} valid leads queued. Beginning sequence...\n`);

        // Provider capacity tracker
        const providers = [
            { name: 'RESEND',  fn: sendViaResend,  limit: 100, used: 0, enabled: !!process.env.RESEND_API_KEY },
            { name: 'BREVO',   fn: sendViaBrevo,   limit: 300, used: 0, enabled: !!process.env.BREVO_API_KEY },
            { name: 'MAILJET', fn: sendViaMailjet,  limit: 200, used: 0, enabled: !!(process.env.MAILJET_API_KEY && process.env.MAILJET_API_SECRET) },
        ];

        let totalSent = 0;
        let totalFailed = 0;
        const isDryRun = process.env.DRY_RUN === 'true';

        for (const [index, agency] of validLeads.entries()) {
            const label = `[${index + 1}/${validLeads.length}]`;
            console.log(`${label} 📨 ${agency.name} → ${agency.email}`);

            // Find the next available provider
            const provider = providers.find(p => p.enabled && p.used < p.limit);
            if (!provider) {
                console.log(`\n🛑 ALL PROVIDERS EXHAUSTED. Stopping.`);
                break;
            }

            const subject = getSubjectLine(agency.name);
            const htmlContent = buildEmailHtml(agency);

            try {
                console.log(`${label} 📡 Via: ${provider.name} (${provider.used + 1}/${provider.limit})`);

                if (!isDryRun) {
                    await provider.fn(agency.email, agency.name, subject, htmlContent);
                } else {
                    console.log(`${label} [DRY RUN] Simulated send.`);
                }
                provider.used++;

                // Update database
                await supabase
                    .from('agencies')
                    .update({
                        status: 'SENT',
                        last_contacted_at: new Date().toISOString(),
                    })
                    .eq('id', agency.id);

                console.log(`${label} ✅ SENT → DB updated`);
                totalSent++;

            } catch (err) {
                console.error(`${label} ❌ FAILED: ${err.message}`);
                totalFailed++;

                // Mark as FAILED in DB so we don't retry it infinitely
                await supabase
                    .from('agencies')
                    .update({ status: 'FAILED' })
                    .eq('id', agency.id);
            }

            // Humanized delay between sends
            if (index < validLeads.length - 1) {
                const waitMs = isDryRun ? 50 : randomDelay(warmupSettings.minDelay, warmupSettings.maxDelay);
                if (!isDryRun) {
                    console.log(`${label} ⏳ Waiting ${Math.round(waitMs / 1000)}s...\n`);
                }
                await sleep(waitMs);
            }
        }

        // ── Summary Report ──
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`  📋 SENDER REPORT`);
        console.log(`${'═'.repeat(60)}`);
        console.log(`  ✅ Sent:       ${totalSent}`);
        console.log(`  ❌ Failed:     ${totalFailed}`);
        console.log(`  🗑️  Invalid:    ${invalidLeads.length}`);
        providers.filter(p => p.enabled).forEach(p => {
            console.log(`  📡 ${p.name}: ${p.used}/${p.limit}`);
        });
        console.log(`  ⏱️  Duration:   ${elapsed}s`);
        console.log(`${'═'.repeat(60)}\n`);

    } catch (err) {
        console.error('❌ FATAL ERROR:', err.message);
        process.exit(1);
    }
}

runSender();
