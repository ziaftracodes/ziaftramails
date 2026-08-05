require('dotenv').config({ path: '../sender/.env' });
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk');
const { getJson } = require("serpapi");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const SEARCH_QUERY = "web development agencies in Australia";

async function runCloudScraper() {
    console.log(`🤖 Booting up Ziaftra Serverless API Scraper...`);
    console.log(`🌍 Target: ${SEARCH_QUERY}`);

    if (!SERPAPI_KEY) {
        console.error("❌ SERPAPI_KEY is missing in your .env file!");
        return;
    }

    try {
        console.log(`\n📍 Querying Google Maps via SerpApi...`);
        const json = await getJson({
            engine: "google_maps",
            q: SEARCH_QUERY,
            type: "search",
            api_key: SERPAPI_KEY
        });

        const rawAgencies = json.local_results || [];
        console.log(`✅ Found ${rawAgencies.length} raw agencies from API!`);

        const validAgencies = [];
        const seenEmails = new Set();

        for (let i = 0; i < Math.min(10, rawAgencies.length); i++) {
            const agency = rawAgencies[i];
            console.log(`\n🕵️ Investigating [${i+1}/${Math.min(10, rawAgencies.length)}]: ${agency.title}`);
            
            if (!agency.website) {
                console.log(`⚠️ No website listed. Skipping.`);
                continue;
            }

            console.log(`🔗 Found Website: ${agency.website}`);

            try {
                // Serverless fetch! No more crashing browsers!
                const response = await fetch(agency.website, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const siteHtml = await response.text();
                
                const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
                const foundEmails = siteHtml.match(emailRegex);

                if (foundEmails && foundEmails.length > 0) {
                    let realEmail = foundEmails.find(e => !e.endsWith('.png') && !e.endsWith('.jpg') && !e.includes('sentry') && !e.includes('wix'));
                    
                    if (realEmail && !seenEmails.has(realEmail)) {
                        console.log(`🎯 EMAIL FOUND: ${realEmail}`);
                        seenEmails.add(realEmail);
                        
                        const site$ = cheerio.load(siteHtml);
                        const plainText = site$('body').text().replace(/\s+/g, ' ').trim().substring(0, 4000);
                        
                        let personalizedIntro = `I was just looking at your agency's website and I absolutely love the recent web development projects you've launched.`;
                        
                        try {
                            console.log(`🧠 Asking Groq to analyze...`);
                            const chatCompletion = await groq.chat.completions.create({
                                messages: [
                                    { role: 'system', content: 'You are an expert lead researcher. Read the provided text from a web agency website. Write a single short, highly personalized sentence complimenting their specific work, clients, or niche based on the text. Address it to the agency as a whole, not a specific person. Return a JSON object with a single key "personalizedIntro". DO NOT return any markdown formatting, just raw JSON.' },
                                    { role: 'user', content: plainText }
                                ],
                                model: 'llama-3.1-8b-instant',
                                response_format: { type: 'json_object' }
                            });
                            
                            const groqResponse = JSON.parse(chatCompletion.choices[0].message.content);
                            if(groqResponse.personalizedIntro) personalizedIntro = groqResponse.personalizedIntro;
                            console.log(`✨ Groq extracted - Intro: ${personalizedIntro}`);
                        } catch (groqErr) {
                            console.error("⚠️ Groq API failed for this agency:", groqErr.message);
                        }

                        validAgencies.push({
                            name: agency.title,
                            website: agency.website,
                            email: realEmail.toLowerCase(),
                            personalized_intro: personalizedIntro,
                            status: 'PENDING',
                            source: 'SerpApi Serverless V3',
                            created_at: new Date()
                        });
                        
                        await new Promise(r => setTimeout(r, 3000));
                    } else {
                        console.log(`⚠️ Email was a duplicate or invalid.`);
                    }
                } else {
                    console.log(`⚠️ No email found on the homepage.`);
                }
            } catch (err) {
                console.log(`❌ Failed to scrape ${agency.title}: ${err.message}`);
            }
        }

        if (validAgencies.length > 0) {
            console.log(`\n💾 Injecting ${validAgencies.length} REAL leads into Supabase...`);
            const { error } = await supabase.from('agencies').upsert(validAgencies, { onConflict: 'email', ignoreDuplicates: true });
            if (error) console.error("❌ Failed to push to database:", error);
            else console.log(`✅ Successfully added ${validAgencies.length} fresh leads!`);
        } else {
            console.log(`\n🤷‍♂️ Could not find any valid emails in this batch.`);
        }

    } catch (error) {
        console.error("❌ API Scraper crashed:", error);
    }
}

runCloudScraper();
