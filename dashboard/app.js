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
    return allAgencies.filter(a => {
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

        const dateStr = agency.created_at
            ? new Date(agency.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';

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
            <td class="date-cell">${dateStr}</td>
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
