require('dotenv').config({ path: '../sender/.env' });
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SEARCH_QUERY = "digital marketing agencies in Canberra Australia";
const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/${encodeURIComponent(SEARCH_QUERY)}`;

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

async function runTest() {
    console.log(`🤖 Booting up Ziaftra AI Scraper (E2E LIVE SEND)...`);
    console.log(`🌍 Target: ${SEARCH_QUERY}`);

    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    
    try {
        console.log(`\n📍 Navigating to Google Maps...`);
        await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));

        console.log(`\n🔍 Extracting Agency Data...`);
        const html = await page.content();
        const $ = cheerio.load(html);
        
        const rawAgencies = [];
        $('a.hfpxzc').each((i, el) => {
            const name = $(el).attr('aria-label');
            const mapsUrl = $(el).attr('href');
            if (name && mapsUrl) {
                rawAgencies.push({ name, mapsUrl });
            }
        });

        if (rawAgencies.length === 0) {
            console.log("No agencies found. Aborting.");
            return;
        }

        for (const agency of rawAgencies) {
            console.log(`\n🕵️ Investigating Agency: ${agency.name}`);
            
            try {
                await page.goto(agency.mapsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                const websiteUrl = await page.evaluate(() => {
                    const webBtn = document.querySelector('a[data-item-id="authority"]');
                    return webBtn ? webBtn.href : null;
                });

                if (!websiteUrl) {
                    console.log("No website found. Skipping.");
                    continue;
                }
                
                console.log(`🔗 Found Website: ${websiteUrl}`);

                await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                const siteHtml = await page.content();
                const site$ = cheerio.load(siteHtml);
                const plainText = site$('body').text().replace(/\s+/g, ' ').trim().substring(0, 4000);
                
                // Regex to find standard emails
                const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
                const foundEmails = siteHtml.match(emailRegex);

                if (!foundEmails || foundEmails.length === 0) {
                    console.log(`⚠️ No email found on the homepage. Skipping.`);
                    continue;
                }

                const realEmail = foundEmails.find(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('sentry') && !e.includes('wix'));

                if (!realEmail) {
                    console.log(`⚠️ Email was a duplicate or invalid. Skipping.`);
                    continue;
                }

                console.log(`🎯 REAL EMAIL FOUND: ${realEmail}`);

                let personalizedIntro = `I was just looking at your agency's website and I absolutely love the recent web development projects you've launched.`;
                
                try {
                    console.log(`🧠 Asking Groq to analyze the website for ${agency.name}...`);
                    const chatCompletion = await groq.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You are an expert lead researcher. Read the provided text from a web agency website. Write a single short, highly personalized sentence complimenting their specific work, clients, or niche based on the text. Address it to the agency as a whole, not a specific person. Return a JSON object with a single key "personalizedIntro". DO NOT return any markdown formatting, just raw JSON.'
                            },
                            {
                                role: 'user',
                                content: plainText
                            }
                        ],
                        model: 'llama-3.1-8b-instant',
                        response_format: { type: 'json_object' }
                    });
                    
                    const groqResponse = JSON.parse(chatCompletion.choices[0].message.content);
                    if(groqResponse.personalizedIntro) personalizedIntro = groqResponse.personalizedIntro;
                    console.log(`✨ Groq extracted - Intro: ${personalizedIntro}`);
                } catch (groqErr) {
                    console.error("⚠️ Groq API failed:", groqErr.message);
                }

                const htmlContent = `
                <p>Hi team,</p>
                <p>${personalizedIntro}</p>
                <p>I'm a full-stack developer (React, Next.js, Node.js) reaching out to see if ${agency.name} ever works with external development partners during busy periods.</p>
                <p>My entire focus is partnering with established digital agencies to handle their paid overflow and outsourcing work on a project or contract basis.</p>
                <p>If your internal team ever gets overloaded or you need to offload web applications, API integrations, or frontend/backend implementation, I would love to be your go-to external partner.</p>
                <p>I know it is risky to trust a new developer with your client work. That is why I am happy to do a completely free, fixed-scope trial task—<b>literally any kind of work you want to throw at me</b>—just so you can evaluate my code quality and communication firsthand.</p>
                <p>You can check out my portfolio here: <b><a href="https://fayzz.in">https://fayzz.in</a></b></p>
                <p>If you are open to an external partnership—or if you just want to test me out with a free task this week—I'd love to chat.</p>
                <p>Best,<br>Fayz<br>Full-Stack Developer<br><a href="https://fayzz.in">fayzz.in</a></p>
                `;

                console.log(`\n📨 LIVE FIRE: Sending email to REAL AGENCY -> ${realEmail}`);
                await sendViaBrevo(realEmail.toLowerCase(), agency.name, htmlContent);
                console.log(`✅ Success! The real email has been sent to ${agency.name} at ${realEmail}.`);
                
                // Break out after the first successful send
                break;

            } catch(e) {
                console.log("Error processing this agency, trying the next one.", e.message);
            }
        }

    } catch (error) {
        console.error("❌ Test crashed:", error);
    } finally {
        await browser.close();
        console.log(`\n🛑 Scraper finished and shut down.`);
    }
}

runTest();
