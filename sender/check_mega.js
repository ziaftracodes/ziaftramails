require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkMega() {
    console.log("🔍 Searching Supabase for 'Studio Mega'...");
    
    const { data, error } = await supabase
        .from('agencies')
        .select('*')
        .ilike('name', '%Studio Mega%');

    if (error) {
        console.error("❌ Error fetching from Supabase:", error);
        return;
    }

    if (!data || data.length === 0) {
        console.log("⚠️ No agency found matching 'Studio Mega'.");
        return;
    }

    console.log(`\n✅ Found ${data.length} match(es):\n`);
    
    data.forEach(agency => {
        console.log(`========================================`);
        console.log(`🏢 Agency: ${agency.name}`);
        console.log(`📧 Email:  ${agency.email}`);
        console.log(`📊 Status: ${agency.status}`);
        console.log(`📅 Scraped At: ${agency.created_at}`);
        console.log(`📅 Emailed At: ${agency.last_contacted_at || 'Not emailed yet'}`);
        console.log(`\n🧠 AI Personalized Intro:`);
        console.log(`"${agency.personalized_intro}"`);
        console.log(`========================================\n`);
    });
}

checkMega();
