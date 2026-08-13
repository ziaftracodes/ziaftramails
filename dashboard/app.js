// ═══════════════════════════════════════════════════════════════
// 🎛️ ZIAFTRA MAILS — DASHBOARD ENGINE v4.0
// Real-time Supabase connection, filtering, search, pagination
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://fpsoftdxghvuefazvmxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_5wcrxQzi6qzJJPbIDclalg_Z5SyTA07';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let allAgencies = [];
let currentFilter = 'all';
let currentSearch = '';
let currentPage = 1;
const PER_PAGE = 25;

// DOM Cache
const $ = (id) => document.getElementById(id);
const el = {
    total: $('metric-total'),
    pending: $('metric-pending'),
    sent: $('metric-sent'),
    replied: $('metric-replied'),
    rate: $('metric-rate'),
    failed: $('metric-failed'),
    body: $('leads-body'),
    refreshBtn: $('refresh-btn'),
    searchInput: $('search-input'),
    pagination: $('pagination'),
    liveDot: $('live-dot'),
    liveText: $('live-text'),
};

// ═══════════════ DATA FETCHING ═══════════════
async function fetchData() {
    el.refreshBtn.disabled = true;
    el.refreshBtn.innerHTML = '<i class="ph ph-spinner-gap spin"></i> Loading...';

    try {
        const { data, error } = await supabaseClient
            .from('agencies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        allAgencies = data || [];

        // Connected!
        el.liveDot.classList.add('connected');
        el.liveText.textContent = `${allAgencies.length} leads synced`;

        updateMetrics();
        renderTable();
        renderDailyStats();
        renderFeed();

    } catch (err) {
        console.error('Fetch error:', err);
        el.liveDot.classList.remove('connected');
        el.liveText.textContent = 'Connection failed';
        el.body.innerHTML = `
            <tr><td colspan="5" class="empty-state">
                <i class="ph ph-wifi-slash empty-icon"></i>
                <p>Failed to connect to Supabase</p>
            </td></tr>`;
    } finally {
        el.refreshBtn.disabled = false;
        el.refreshBtn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Refresh';
    }
}

// ═══════════════ METRICS ═══════════════
function updateMetrics() {
    const total = allAgencies.length;
    const pending = allAgencies.filter(a => a.status === 'PENDING').length;
    const sent = allAgencies.filter(a => a.status === 'SENT').length;
    const replied = allAgencies.filter(a => a.status === 'REPLIED').length;
    const failed = allAgencies.filter(a => a.status === 'FAILED' || a.status === 'INVALID').length;

    // Animate counters
    animateValue(el.total, total);
    animateValue(el.pending, pending);
    animateValue(el.sent, sent);
    animateValue(el.replied, replied);
    animateValue(el.failed, failed);

    // Success rate = sent / (sent + failed) * 100
    const attempts = sent + failed;
    const rate = attempts > 0 ? Math.round((sent / attempts) * 100) : 0;
    el.rate.textContent = attempts > 0 ? `${rate}%` : '—';
}

function animateValue(element, target) {
    const current = parseInt(element.textContent) || 0;
    if (current === target) { element.textContent = target; return; }

    const duration = 400;
    const start = performance.now();

    function step(timestamp) {
        const progress = Math.min((timestamp - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        element.textContent = Math.round(current + (target - current) * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ═══════════════ FILTERING & SEARCH ═══════════════
function getFilteredAgencies() {
    let filtered = allAgencies.filter(a => {
        // Filter
        if (currentFilter !== 'all' && a.status !== currentFilter) return false;
        // Search
        if (currentSearch) {
            const q = currentSearch.toLowerCase();
            const searchable = `${a.name} ${a.email} ${a.source || ''} ${a.website || ''}`.toLowerCase();
            if (!searchable.includes(q)) return false;
        }
        return true;
    });

    // If viewing Sent or Replied, sort by when they were contacted instead of when they were scraped
    if (currentFilter === 'SENT' || currentFilter === 'REPLIED') {
        filtered.sort((a, b) => new Date(b.last_contacted_at || 0) - new Date(a.last_contacted_at || 0));
    }

    return filtered;
}

// ═══════════════ TABLE RENDERING ═══════════════
function renderTable() {
    const filtered = getFilteredAgencies();
    const totalPages = Math.ceil(filtered.length / PER_PAGE);
    if (currentPage > totalPages) currentPage = 1;

    const start = (currentPage - 1) * PER_PAGE;
    const pageData = filtered.slice(start, start + PER_PAGE);

    if (filtered.length === 0) {
        el.body.innerHTML = `
            <tr><td colspan="5" class="empty-state">
                <i class="ph ph-ghost empty-icon"></i>
                <p>${currentSearch ? 'No results match your search.' : 'No leads in this category yet.'}</p>
            </td></tr>`;
        el.pagination.innerHTML = '';
        return;
    }

    el.body.innerHTML = pageData.map(agency => {
        const statusIcon = {
            'PENDING': 'hourglass',
            'SENT': 'paper-plane-tilt',
            'REPLIED': 'chat-circle-text',
            'FAILED': 'warning-circle',
            'INVALID': 'x-circle',
        }[agency.status] || 'question';

        const formatTime = (isoString) => {
            if (!isoString) return '—';
            const date = new Date(isoString);
            const now = new Date();
            const diffHours = Math.floor(Math.abs(now - date) / 36e5);
            if (diffHours < 24) {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            }
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        const scrapedAt = formatTime(agency.created_at);
        const emailedAt = formatTime(agency.last_contacted_at);

        return `
        <tr>
            <td>
                <div class="agency-cell">
                    <strong>${escapeHtml(agency.name)}</strong>
                    ${agency.website ? `<a href="${agency.website}" target="_blank" rel="noopener" class="website-link"><i class="ph ph-arrow-square-out"></i></a>` : ''}
                </div>
            </td>
            <td class="email-cell">${escapeHtml(agency.email)}</td>
            <td class="source-cell" title="${escapeHtml(agency.source || '')}">${escapeHtml(agency.source || '—')}</td>
            <td>
                <span class="status-badge status-${agency.status}">
                    <i class="ph ph-${statusIcon}"></i>
                    ${agency.status}
                </span>
            </td>
            <td class="date-cell" style="color: #64748b; font-size: 0.9em;">${scrapedAt}</td>
            <td class="date-cell" style="color: #64748b; font-size: 0.9em;">${emailedAt}</td>
            <td>
                <button class="btn-preview" onclick="previewEmail('${agency.id}')">
                    <i class="ph ph-eye"></i> Preview
                </button>
            </td>
        </tr>`;
    }).join('');

    renderPagination(filtered.length, totalPages);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

// ═══════════════ PAGINATION ═══════════════
function renderPagination(totalItems, totalPages) {
    if (totalPages <= 1) { el.pagination.innerHTML = ''; return; }

    let html = '';

    // Previous
    if (currentPage > 1) {
        html += `<button onclick="goToPage(${currentPage - 1})"><i class="ph ph-caret-left"></i></button>`;
    }

    // Page numbers (show max 5)
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    // Next
    if (currentPage < totalPages) {
        html += `<button onclick="goToPage(${currentPage + 1})"><i class="ph ph-caret-right"></i></button>`;
    }

    el.pagination.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderTable();
    // Scroll table into view
    document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ═══════════════ EVENT LISTENERS ═══════════════

// Refresh
el.refreshBtn.addEventListener('click', fetchData);

// Filter tabs
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        currentPage = 1;
        renderTable();
    });
});

// Search (debounced)
let searchTimeout;
el.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        renderTable();
    }, 250);
});

// Auto-refresh every 60 seconds
setInterval(fetchData, 60000);

// ═══════════════ BOOT ═══════════════
document.addEventListener('DOMContentLoaded', fetchData);

// Make goToPage globally accessible for inline onclick
window.goToPage = goToPage;

// ═══════════════ VIEW TOGGLES ═══════════════
document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const view = btn.dataset.view;
        document.getElementById('view-pipeline').style.display = 'none';
        document.getElementById('view-analytics').style.display = 'none';
        document.getElementById('view-feed').style.display = 'none';
        
        document.getElementById('view-' + view).style.display = 'block';
    });
});

// ═══════════════ SCROLLABLE FEED ═══════════════
function renderFeed() {
    const feedContainer = document.getElementById('feed-container');
    
    // Get sent/replied agencies, sorted by most recently contacted
    const feedAgencies = allAgencies
        .filter(a => a.status === 'SENT' || a.status === 'REPLIED')
        .sort((a, b) => new Date(b.last_contacted_at || 0) - new Date(a.last_contacted_at || 0))
        .slice(0, 100); // Limit to 100 to prevent performance issues

    if (feedAgencies.length === 0) {
        feedContainer.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-ghost empty-icon"></i>
                <p>No emails have been sent yet.</p>
            </div>`;
        return;
    }

    feedContainer.innerHTML = feedAgencies.map(agency => {
        const isMarketing = (agency.source || '').toLowerCase().includes('marketing');
        const subject = isMarketing ? getMarketingSubjectLine(agency.name) : getWebDevSubjectLine(agency.name);
        
        const dateStr = new Date(agency.last_contacted_at).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });

        // The exact provider isn't saved in the DB, so we indicate it's from the Load Balancer
        // We can add a feature to save the provider for future emails.
        const providerName = agency.provider || "Resend/Brevo (Load Balancer)";

        return `
            <div class="feed-card" style="cursor: pointer; position: relative;" onclick="previewEmail('${agency.id}')">
                <div class="feed-header" style="padding: 0.8rem 1.2rem;">
                    <div class="feed-header-left">
                        <div class="feed-avatar" style="width: 32px; height: 32px; font-size: 1rem;"><i class="ph ph-buildings"></i></div>
                        <div class="feed-info">
                            <strong>${escapeHtml(agency.name)}</strong>
                            <span style="font-size: 0.75rem;">${escapeHtml(agency.email)}</span>
                        </div>
                    </div>
                    <div class="feed-date" style="text-align: right;">
                        <div>${dateStr}</div>
                        <div style="font-size: 0.7rem; color: var(--accent); margin-top: 2px;">⚡ ${providerName}</div>
                    </div>
                </div>
                <div class="feed-subject" style="padding: 0.8rem 1.2rem; border-bottom: none; font-size: 0.95rem; font-weight: 400; color: var(--text-secondary);">
                    <strong style="color: var(--text-primary);">Subject:</strong> ${subject}
                </div>
            </div>
        `;
    }).join('');
}

// ═══════════════ DAILY ANALYTICS ═══════════════
function renderDailyStats() {
    const stats = {};

    allAgencies.forEach(agency => {
        if (agency.status === 'SENT' || agency.status === 'REPLIED' || agency.status === 'FAILED') {
            if (!agency.last_contacted_at) return;
            const dateObj = new Date(agency.last_contacted_at);
            const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            if (!stats[dateStr]) {
                stats[dateStr] = { sent: 0, replied: 0, failed: 0, timestamp: dateObj.getTime() };
            }
            
            if (agency.status === 'SENT') stats[dateStr].sent++;
            if (agency.status === 'REPLIED') {
                stats[dateStr].sent++; // Replied implies it was sent
                stats[dateStr].replied++;
            }
            if (agency.status === 'FAILED') stats[dateStr].failed++;
        }
    });

    const sortedDates = Object.keys(stats).sort((a, b) => stats[b].timestamp - stats[a].timestamp);
    const tbody = document.getElementById('analytics-body');
    
    if (sortedDates.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No emails have been sent yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = sortedDates.map(date => {
        const s = stats[date];
        return `
            <tr>
                <td><strong>${date}</strong></td>
                <td><span style="color: var(--blue); font-weight: 600;">${s.sent}</span></td>
                <td><span style="color: var(--green); font-weight: 600;">${s.replied}</span></td>
                <td><span style="color: var(--red); font-weight: 600;">${s.failed}</span></td>
            </tr>
        `;
    }).join('');
}

// ═══════════════ EMAIL PREVIEW MODAL ═══════════════

function getWebDevSubjectLine(agencyName) {
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

function getMarketingSubjectLine(agencyName) {
    const subjects = [
        `Landing page help for ${agencyName} campaigns`,
        `Overflow landing page builds for ${agencyName}`,
        `Free landing page trial for ${agencyName}`,
        `Extra web dev hands for ${agencyName} campaigns`,
        `Partnership idea for ${agencyName}`,
    ];
    return subjects[Math.floor(Math.random() * subjects.length)];
}

function buildWebDevEmailHtml(agency) {
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

function buildMarketingEmailHtml(agency) {
    return `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 15px; color: #333; line-height: 1.7; max-width: 600px;">
    <p>Hi team,</p>
    <p>${agency.personalized_intro || ''}</p>
    <p>I'm a web developer specializing in fast-turnaround landing pages, and I'm reaching out to see if <strong>${agency.name}</strong> ever needs an extra set of hands during busy campaign periods.</p>
    <p>My entire focus is helping digital advertising and lead-generation agencies handle their overflow by rapidly building clean, high-converting landing pages, marketing funnels, and simple promotional sites.</p>
    <p>When your internal team gets bottlenecked launching new client campaigns, I can step in as a reliable external partner to just crank out the landing pages you need on time.</p>
    <p>I know it's risky to trust a new developer with client work. That's why I'm happy to do a <strong>completely free, fixed-scope trial task</strong> — a free landing page build — just so you can evaluate my speed and quality firsthand.</p>
    <p>You can check out my portfolio here: <strong><a href="https://fayzz.in" style="color: #2563eb;">fayzz.in</a></strong></p>
    <p>If you're open to an external partnership for high-volume work — or if you just want to test me out with a free page this week — I'd love to chat.</p>
    <p style="margin-top: 24px;">
        Best,<br>
        <strong>Fayz</strong><br>
        <span style="color: #666;">Web Developer</span><br>
        <a href="https://fayzz.in" style="color: #2563eb;">fayzz.in</a>
    </p>
</div>`.trim();
}

window.previewEmail = function(agencyId) {
    const agency = allAgencies.find(a => a.id === agencyId);
    if (!agency) return;

    // Detect if marketing or web dev based on source keyword
    const isMarketing = (agency.source || '').toLowerCase().includes('marketing');
    
    // NOTE: This shows a generated subject line since the real one isn't stored in the DB
    const subject = isMarketing ? getMarketingSubjectLine(agency.name) : getWebDevSubjectLine(agency.name);
    const htmlBody = isMarketing ? buildMarketingEmailHtml(agency) : buildWebDevEmailHtml(agency);

    document.getElementById('modal-to').textContent = agency.email;
    document.getElementById('modal-subject').textContent = subject + ' (Note: Randomly selected sample)';
    document.getElementById('modal-html').innerHTML = htmlBody;
    
    document.getElementById('email-modal').classList.add('show');
};

document.getElementById('close-modal').addEventListener('click', () => {
    document.getElementById('email-modal').classList.remove('show');
});

// Close modal on click outside
document.getElementById('email-modal').addEventListener('click', (e) => {
    if (e.target.id === 'email-modal') {
        document.getElementById('email-modal').classList.remove('show');
    }
});
