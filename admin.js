// ============================================================================
// ⚙️ Admin 설정 및 상태 관리
// ============================================================================
// ❗ [중요] Admin.gs 배포 후 발급받은 "웹 앱 URL"을 아래에 입력하세요.
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyB8sq1GtlItK79UlklgeS93myTV4hITpH9HnjO2r9HWM0_FKEYz9hgCYoY7sNvJFhf/exec';

let allData = [];      // DATA 탭용 데이터 (운영 DB)
let roadData = [];     // ROAD 탭용 데이터 (대기실)
let filteredData = []; // 현재 화면에 표시 중인 데이터
let currentTab = 'data'; // 'data', 'calendar', 'road'

let currentPage = 1;
let itemsPerPage = 30;
let sessionPassword = null;
let currentMode = 'create';
let selectedLink = null;

// 캘린더용 변수
let calendarDate = new Date();
let selectedCalDate = null; 

// 카테고리 & 키워드 설정
const CATEGORY_OPTIONS = [
    '콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비',
    '우얘합', '하루의마무리', '라이브',
    '인스타그램', '릴스', '셀카', '투샷',
    '프롬혚쾌', '혚쾌버블',
    '레코딩로그', '만년썰전', '버킷리스트', '엔킷리스트', '승캠', '합주일지', '메이킹', '비하인드', '팬싸', '인터뷰', '방송', '공식컨텐츠', '예능',
    '질투', '친지마', '모음집', '입덕가이드', '연말결산', '필독', '월드컵'
].sort();

const FIXED_KEYWORDS = [
    "✔️ 입덕가이드", "🎤 무대영상", "📁 모음집", "💻 공카", "🎀 팬싸",
    "🔴 라이브", "📖 혚쾌키워드", "📽 릴스", "🗂 연말결산", "❤️ 유튜브 라이브",
    "📷 투샷", "📸 셀카", "✨ 인스타그램", "💬 혚쾌버블", "💬 프롬혚쾌",
    "📹 자체컨텐츠", "📻 방송", "📰 인터뷰", "📹 공식컨텐츠",
    "📰 인터뷰, 📖 혚쾌키워드", "🔴 라이브, 📖 혚쾌키워드",
    "💬 혚쾌버블, 📖 혚쾌키워드", "💬 프롬혚쾌, 📖 혚쾌키워드",
    "❤️ 유튜브 라이브, 📖 혚쾌키워드", "📹 자체컨텐츠, 📖 혚쾌키워드", "🏆 월드컵"
];

// DOM 요소
const loginOverlay = document.getElementById('login-overlay');
const dashboardContainer = document.getElementById('dashboard-container');
const passwordInput = document.getElementById('admin-password-input');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

const listContainer = document.getElementById('content-list-container');
const searchInput = document.getElementById('list-search');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageIndicator = document.getElementById('page-indicator');
const createNewBtn = document.getElementById('create-new-btn');
const itemsPerPageSelect = document.getElementById('items-per-page-select');
const refreshBtn = document.getElementById('refresh-btn');

// 캘린더 요소
const calendarSection = document.getElementById('calendar-section');
const calTitle = document.getElementById('cal-title');
const calPrevBtn = document.getElementById('cal-prev-btn');
const calNextBtn = document.getElementById('cal-next-btn');
const calGrid = document.getElementById('admin-calendar-grid');

// 에디터 요소
const editorModal = document.getElementById('editor-modal');
const editorModalBg = document.getElementById('editor-modal-bg');
const closeEditorBtn = document.getElementById('close-editor-btn');
const editorTitle = document.getElementById('editor-title');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const extractThumbBtn = document.getElementById('extract-thumb-btn');
const thumbnailPreview = document.getElementById('thumbnail-preview');

const inputs = {
    title: document.getElementById('input-title'),
    date: document.getElementById('input-date'),
    link: document.getElementById('input-link'),
    category: document.getElementById('input-category'),
    account: document.getElementById('input-account'),
    original: document.getElementById('input-original'),
    year: document.getElementById('input-year'),
    month: document.getElementById('input-month'),
    thumbnail: document.getElementById('input-thumbnail'),
    searchKw: document.getElementById('input-search-kw'),
    keywords: document.getElementById('input-keywords'),
    comment: document.getElementById('input-comment'),
    published: document.getElementById('input-published')
};

// ============================================================================
// 🔐 로그인 및 초기화
// ============================================================================
loginBtn.addEventListener('click', attemptLogin);
passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') attemptLogin(); });

async function attemptLogin() {
    const pw = passwordInput.value;
    if (!pw) return alert("비밀번호를 입력하세요.");

    const originalBtnText = loginBtn.innerText;
    loginBtn.innerText = "확인 중...";
    loginBtn.disabled = true;
    sessionPassword = pw;

    try {
        const result = await sendData('login', {});
        if (result.status === 'success') {
            loginOverlay.classList.add('hidden');
            dashboardContainer.classList.remove('hidden');
            initAdmin();
        } else {
            throw new Error(result.message || "비밀번호 불일치");
        }
    } catch (e) {
        alert("비밀번호가 올바르지 않습니다.");
        console.error(e);
        sessionPassword = null;
        passwordInput.value = '';
        passwordInput.focus();
    } finally {
        loginBtn.innerText = originalBtnText;
        loginBtn.disabled = false;
    }
}

logoutBtn.addEventListener('click', () => {
    sessionPassword = null;
    location.reload();
});

async function initAdmin() {
    initCategorySelect();
    initKeywordSelect();
    setupCalendarEvents(); 
    switchTab('data'); 
}

// 탭 전환 함수
async function switchTab(tabName) {
    currentTab = tabName;
    currentPage = 1;
    searchInput.value = ''; 

    // UI 요소
    const dataBtn = document.getElementById('tab-btn-data');
    const calBtn = document.getElementById('tab-btn-calendar');
    const roadBtn = document.getElementById('tab-btn-road');
    const roadControls = document.getElementById('road-controls');
    
    // 버튼 스타일 초기화
    [dataBtn, roadBtn, calBtn].forEach(btn => {
        if(btn) {
            btn.classList.replace('border-red-600', 'border-transparent');
            btn.classList.remove('text-white');
            btn.classList.add('text-gray-400');
        }
    });

    // 선택된 탭 스타일
    let activeBtn;
    if (tabName === 'data') activeBtn = dataBtn;
    else if (tabName === 'calendar') activeBtn = calBtn;
    else if (tabName === 'road') activeBtn = roadBtn;

    if(activeBtn) {
        activeBtn.classList.replace('border-transparent', 'border-red-600');
        activeBtn.classList.replace('text-gray-400', 'text-white');
    }

    // 영역 보이기/숨기기
    if (tabName === 'data') {
        roadControls?.classList.add('hidden');
        calendarSection.classList.add('hidden');
        createNewBtn.classList.remove('hidden');
    } else if (tabName === 'calendar') {
        roadControls?.classList.add('hidden');
        calendarSection.classList.remove('hidden'); 
        createNewBtn.classList.remove('hidden');
        selectedCalDate = null;
        renderAdminCalendar();
    } else if (tabName === 'road') {
        roadControls?.classList.remove('hidden');
        calendarSection.classList.add('hidden');
        createNewBtn.classList.add('hidden'); // ROAD탭에서는 신규 추가 버튼 숨김
    }

    await fetchData(); 
}

function initCategorySelect() {
    inputs.category.innerHTML = '<option value="">선택하세요</option>';
    CATEGORY_OPTIONS.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.innerText = cat;
        inputs.category.appendChild(opt);
    });
}

function initKeywordSelect() {
    inputs.keywords.innerHTML = '<option value="">선택하세요</option>';
    FIXED_KEYWORDS.forEach(kw => {
        const opt = document.createElement('option');
        opt.value = kw; 
        opt.innerText = kw;
        inputs.keywords.appendChild(opt);
    });
}

function updateThumbnailPreview(url) {
    if (url && url.startsWith('http')) {
        thumbnailPreview.src = url;
        thumbnailPreview.classList.remove('hidden');
        thumbnailPreview.onerror = () => thumbnailPreview.classList.add('hidden');
    } else {
        thumbnailPreview.src = '';
        thumbnailPreview.classList.add('hidden');
    }
}

inputs.thumbnail.addEventListener('input', (e) => updateThumbnailPreview(e.target.value));

itemsPerPageSelect.addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderList();
});

// ============================================================================
// 🔄 새로고침 버튼 로직
// ============================================================================
if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
        const icon = refreshBtn.querySelector('i');
        if(icon) icon.classList.add('fa-spin');
        refreshBtn.disabled = true;

        await fetchData();

        setTimeout(() => {
            if(icon) icon.classList.remove('fa-spin');
            refreshBtn.disabled = false;
        }, 500);
    });
}

// ============================================================================
// 📡 데이터 통신 (API 호출)
// ============================================================================
async function fetchData() {
    listContainer.innerHTML = '<div class="text-center text-gray-500 mt-10"><i class="fas fa-spinner fa-spin"></i> 데이터 로딩 중...</div>';
    try {
        const requestType = (currentTab === 'road') ? 'road' : 'full';
        const url = GOOGLE_SHEET_API_URL + '?type=' + requestType; 

        const res = await fetch(url);
        const json = await res.json();
        
        const mappedData = json.data.map(item => ({
            title: item['title'] || '',
            date: item['date'] || '',
            link: item['link'] || '',
            category: item['category'] || '',
            account: item['account'] || '', 
            original: item['original'] || '',
            year: item['year'] || '',
            month: item['month'] || '',
            thumbnail: item['thumbnail'] || '',
            searchKeywords: item['searchKeywords'] || '',
            keywords: item['keywords'] || '', 
            comment: item['comment'] || '',
            isPublished: item['isPublished']
        })).sort((a, b) => (b.date || '0000').localeCompare(a.date || '0000'));

        if (currentTab === 'road') {
            roadData = mappedData;
            filteredData = roadData;
        } else {
            allData = mappedData;
            if (currentTab === 'calendar' && selectedCalDate) {
                filteredData = allData.filter(item => item.date && item.date.startsWith(selectedCalDate));
            } else {
                filteredData = allData;
            }
        }
        
        if (currentTab === 'calendar') {
            renderAdminCalendar(); 
        }
        renderList();

    } catch (e) {
        listContainer.innerHTML = '<div class="text-center text-red-500 mt-10">데이터 로드 실패</div>';
        console.error(e);
    }
}

async function sendData(action, data, directLink = null) {
    if (!sessionPassword) return alert("세션이 만료되었습니다.");

    const payload = {
        action: action,
        password: sessionPassword,
        link: directLink ? directLink : ((action === 'add' || action === 'fetch_twitter') ? null : selectedLink),
        data: data
    };
    
    if (action === 'fetch_twitter') {
        payload.username = data.username;
        payload.account = data.account;
        payload.startDate = data.startDate;
        payload.endDate = data.endDate;
    }

    try {
        const res = await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const json = await res.json();
        return json;
    } catch (e) {
        console.error(e);
        return { status: 'error', message: "통신 오류: " + e };
    }
}

// ============================================================================
// 📅 캘린더 로직
// ============================================================================
function setupCalendarEvents() {
    if(!calPrevBtn || !calNextBtn) return;
    
    calPrevBtn.onclick = () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderAdminCalendar();
    };
    calNextBtn.onclick = () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderAdminCalendar();
    };
}

function renderAdminCalendar() {
    if(!calGrid || !calTitle) return;

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    calTitle.innerText = `${year}. ${String(month + 1).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    calGrid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        calGrid.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= lastDate; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const count = allData.filter(item => item.date && item.date.startsWith(dateStr)).length;
        const isSelected = selectedCalDate === dateStr;
        const isToday = (new Date().toISOString().slice(0, 10) === dateStr);

        const cell = document.createElement('div');
        cell.className = `aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition duration-200 border border-transparent hover:bg-gray-700 relative
            ${isSelected ? 'bg-gray-700 border-red-600 ring-1 ring-red-600 text-white' : 'bg-gray-800 text-gray-400'}
            ${isToday && !isSelected ? 'border-gray-500 border-dashed border' : ''}
        `;
        
        let html = `<span class="text-sm font-bold ${isToday ? 'text-red-400' : ''}">${i}</span>`;
        if (count > 0) {
            html += `<div class="flex gap-0.5 mt-1">`;
            for(let k=0; k<Math.min(count, 3); k++) {
                html += `<div class="w-1 h-1 bg-red-500 rounded-full"></div>`;
            }
            if(count > 3) html += `<div class="w-1 h-1 bg-gray-500 rounded-full"></div>`;
            html += `</div>`;
        }

        cell.innerHTML = html;
        cell.onclick = () => {
            selectedCalDate = (selectedCalDate === dateStr) ? null : dateStr;
            renderAdminCalendar(); 
            if (selectedCalDate) {
                filteredData = allData.filter(item => item.date && item.date.startsWith(selectedCalDate));
            } else {
                filteredData = allData;
            }
            currentPage = 1;
            renderList();
        };
        calGrid.appendChild(cell);
    }
}

// ============================================================================
// 📋 리스트 렌더링 (모든 탭에서 카드형 그리드 사용)
// ============================================================================
function renderList() {
    const listHeader = document.getElementById('list-header');
    
    // 모바일 리스트 헤더 숨김 (ROAD 탭에서도 카드형을 쓰므로 불필요)
    if (listHeader) {
        listHeader.classList.add('hidden'); 
        listHeader.classList.remove('md:flex');
    }

    listContainer.innerHTML = '';
    
    // 데이터 없음
    if (filteredData.length === 0) {
        listContainer.className = 'flex flex-col';
        let msg = '데이터가 없습니다.';
        if(currentTab === 'calendar' && selectedCalDate) {
            msg = `📅 ${selectedCalDate} 에 기록된 데이터가 없습니다.`;
        }
        listContainer.innerHTML = `<div class="text-center text-gray-500 py-20">${msg}</div>`;
        pageIndicator.innerText = `0 / 0`;
        return;
    }

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredData.slice(start, end);

    // [모든 탭] -> 카드형 그리드 레이아웃 적용
    listContainer.className = 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4';

    pageItems.forEach(item => {
        const thumbUrl = item.thumbnail || '';
        let thumbHtml = thumbUrl 
            ? `<img src="${thumbUrl}" class="w-full h-full object-cover transition duration-500 group-hover:scale-110" loading="lazy">`
            : `<div class="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600"><i class="fas fa-image"></i></div>`;

        // ROAD 탭 아이템은 기본적으로 비공개 상태지만, 여기선 흐리게 표시하지 않고 
        // 뱃지 등으로 구분하거나, 원한다면 밝게 표시합니다. 
        // 기존 로직: 비공개면 흐림. ROAD 데이터는 isPublished가 없을 수 있음.
        const isRoadItem = (currentTab === 'road');
        const opacityClass = (!isRoadItem && (item.isPublished === false || item.isPublished === 'FALSE')) ? 'opacity-50 grayscale' : '';
        
        const card = document.createElement('div');
        card.className = `group bg-[#181818] rounded-md overflow-hidden relative transition duration-300 hover:z-20 hover:scale-105 hover:shadow-2xl border border-transparent hover:border-gray-600 ${opacityClass}`;
        
        let statusBadge = '';
        if (isRoadItem) {
            statusBadge = '<div class="absolute top-2 right-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow z-10">NEW (Road)</div>';
        } else if (item.isPublished === false || item.isPublished === 'FALSE') {
            statusBadge = '<div class="absolute inset-0 flex items-center justify-center bg-black/60 text-gray-400 text-xs font-bold"><i class="fas fa-eye-slash mr-1"></i> 비공개</div>';
        }

        // ROAD 탭일 경우 클릭 시 동작: 에디터 열기 (selectItem)
        // DATA 탭일 경우: 동일
        
        card.innerHTML = `
            <div class="aspect-video overflow-hidden relative bg-gray-900 cursor-pointer" onclick="selectItem(this.closest('.group').dataset.link)">
                ${thumbHtml}
                ${statusBadge}
            </div>
            <div class="p-3 cursor-pointer" onclick="selectItem(this.closest('.group').dataset.link)">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[10px] font-bold text-red-400 border border-red-900 bg-red-900/20 px-1.5 py-0.5 rounded truncate max-w-[60%]">${item.category || '미분류'}</span>
                    <span class="text-[10px] text-gray-500">${item.date || '-'}</span>
                </div>
                <h3 class="text-xs md:text-sm font-bold text-gray-200 leading-snug line-clamp-2 group-hover:text-white transition h-[2.5em]">${item.title}</h3>
            </div>
            <div class="absolute inset-0 bg-black/80 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition duration-200 backdrop-blur-[2px] pointer-events-none">
                <div class="pointer-events-auto flex gap-2">
                    <button class="bg-blue-600 hover:bg-blue-500 text-white w-10 h-10 rounded-full shadow-lg transform hover:scale-110 transition flex items-center justify-center" 
                        onclick="selectItem(this.closest('.group').dataset.link)" title="${isRoadItem ? '수정 및 게시' : '수정'}">
                        <i class="fas ${isRoadItem ? 'fa-upload' : 'fa-pencil-alt'}"></i>
                    </button>
                    <button class="bg-red-600 hover:bg-red-500 text-white w-10 h-10 rounded-full shadow-lg transform hover:scale-110 transition flex items-center justify-center" 
                        onclick="deleteItemFromCard(this.closest('.group').dataset.link)" title="삭제">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
        card.dataset.link = item.link; 
        listContainer.appendChild(card);
    });

    pageIndicator.innerText = `${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    prevPageBtn.style.opacity = currentPage === 1 ? 0.5 : 1;
    nextPageBtn.style.opacity = currentPage === totalPages ? 0.5 : 1;
}

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const sourceData = (currentTab === 'road') ? roadData : allData;
    filteredData = sourceData.filter(item => 
        item.title.toLowerCase().includes(query) || 
        (item.searchKeywords && item.searchKeywords.toLowerCase().includes(query))
    );
    currentPage = 1;
    renderList();
});

prevPageBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderList(); } };
nextPageBtn.onclick = () => { if (currentPage < Math.ceil(filteredData.length / itemsPerPage)) { currentPage++; renderList(); } };

// ============================================================================
// 🐦 트위터 수집 및 게시 (Admin.gs 연동)
// ============================================================================
async function requestTwitterFetch() {
    const account = document.getElementById('tw-account').value;
    const start = document.getElementById('tw-start').value;
    const end = document.getElementById('tw-end').value;

    if (!account || !start || !end) return alert("계정, 시작일, 종료일을 모두 입력해주세요.");

    const modal = document.getElementById('twitter-modal');
    const btn = modal ? modal.querySelector('button:last-child') : null;
    let originalText = "";

    if (btn) {
        originalText = btn.innerText;
        btn.innerText = "수집 중... (약 10초 소요)";
        btn.disabled = true;
    }

    try {
        const result = await sendData('fetch_twitter', { 
            username: account,
            account: account, 
            startDate: start, 
            endDate: end 
        });

        alert(result.message); 

        if (result.status === 'success') {
            document.getElementById('twitter-modal').classList.add('hidden');
            await fetchData(); 
        }
    } catch(e) {
        alert("오류 발생: " + e);
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
}

// 구 버전(리스트형)에서 쓰던 함수지만 호환성을 위해 남겨둡니다.
async function publishItem(link) {
    // 이제는 selectItem -> 에디터 -> 게시 과정을 권장합니다.
    if(!confirm("이 트윗을 DATA(운영) 시트로 게시하시겠습니까?\n게시 후 Index 페이지에 노출됩니다.")) return;
    
    const item = roadData.find(i => i.link === link);
    if (!item) return alert("데이터를 찾을 수 없습니다.");

    try {
        await sendData('publish', item); 
        alert("성공적으로 게시되었습니다!");
        await fetchData();
    } catch(e) {
        alert("게시 실패: " + e);
    }
}

// ============================================================================
// 📝 에디터 & 썸네일
// ============================================================================
function openEditorModal() {
    editorModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}

function closeEditorModal() {
    editorModal.classList.add('hidden');
    document.body.style.overflow = '';
}

closeEditorBtn.addEventListener('click', closeEditorModal);
editorModalBg.addEventListener('click', closeEditorModal);

async function tryExtractThumbnail() {
    const url = inputs.link.value.trim();
    if (!url) return;

    extractThumbBtn.innerText = "⏳";
    extractThumbBtn.disabled = true;

    try {
        const res = await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'extract', url: url })
        });
        const json = await res.json();
        
        if (json.status === 'success' && json.url) {
            inputs.thumbnail.value = json.url;
            updateThumbnailPreview(json.url);
            extractThumbBtn.innerText = "✅";
        } else {
            extractThumbBtn.innerText = "⚠️"; 
        }
    } catch (e) {
        extractThumbBtn.innerText = "❌";
    } finally {
        setTimeout(() => extractThumbBtn.innerText = "자동 추출", 2000);
        extractThumbBtn.disabled = false;
    }
}

inputs.link.addEventListener('blur', tryExtractThumbnail);
extractThumbBtn.addEventListener('click', tryExtractThumbnail);

function resetFormInputs() {
    Object.values(inputs).forEach(input => input.value = '');
    inputs.year.value = new Date().getFullYear();
    updateThumbnailPreview('');
}

function selectItem(arg) {
    // [수정] ROAD 탭에서도 수정창 열기 허용 (기존: if (currentTab === 'road') return;)
    
    let item;
    if (typeof arg === 'string') {
        const sourceData = (currentTab === 'road') ? roadData : allData;
        item = sourceData.find(i => i.link === arg);
    } else {
        item = arg;
    }

    if (!item) return alert("데이터를 찾을 수 없습니다.");

    currentMode = 'update';
    selectedLink = item.link;
    editorTitle.innerText = (currentTab === 'road') ? "데이터 수정 및 게시" : "데이터 수정";
    deleteBtn.classList.remove('hidden');
    
    // 버튼 텍스트 변경
    if (currentTab === 'road') {
        saveBtn.innerText = "수정 후 게시하기";
        saveBtn.classList.replace('bg-red-600', 'bg-blue-600'); 
        saveBtn.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
    } else {
        saveBtn.innerText = "수정사항 저장";
        saveBtn.classList.replace('bg-red-600', 'bg-blue-600');
        saveBtn.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
    }

    inputs.title.value = item.title;
    inputs.date.value = item.date && item.date.length > 10 ? item.date.substring(0, 10) : item.date;
    inputs.link.value = item.link;
    inputs.category.value = item.category;
    inputs.account.value = item.account;
    inputs.original.value = item.original;
    inputs.year.value = item.year;
    inputs.month.value = item.month ? item.month.replace('월', '') : '';
    inputs.thumbnail.value = item.thumbnail;
    inputs.searchKw.value = item.searchKeywords;
    inputs.keywords.value = item.keywords;
    inputs.comment.value = item.comment;
    inputs.published.checked = (item.isPublished === true || item.isPublished === 'TRUE' || item.isPublished === '' || currentTab === 'road'); // ROAD는 기본 체크

    updateThumbnailPreview(item.thumbnail); 
    openEditorModal();
}

createNewBtn.addEventListener('click', () => {
    currentMode = 'create';
    selectedLink = null;
    editorTitle.innerText = "신규 데이터 추가";
    deleteBtn.classList.add('hidden');
    saveBtn.innerText = "새 데이터 등록";
    saveBtn.classList.replace('bg-blue-600', 'bg-red-600');
    saveBtn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');

    resetFormInputs();
    inputs.published.checked = true;
    openEditorModal();
});

saveBtn.addEventListener('click', async () => {
    const newData = {
        title: inputs.title.value.trim(),
        date: inputs.date.value.trim(),
        link: inputs.link.value.trim(),
        category: inputs.category.value,
        account: inputs.account.value.trim(),
        original: inputs.original.value.trim(),
        year: inputs.year.value,
        month: inputs.month.value ? inputs.month.value + '월' : '',
        thumbnail: inputs.thumbnail.value.trim(),
        searchKeywords: inputs.searchKw.value.trim(),
        keywords: inputs.keywords.value.trim(),
        comment: inputs.comment.value.trim(),
        isPublished: inputs.published.checked,
    };

    if (!newData.title || !newData.link) return alert("제목과 링크는 필수입니다.");
    
    saveBtn.innerText = "처리 중...";
    saveBtn.disabled = true;

    try {
        // [수정] ROAD 탭에서 저장은 곧 '게시(Publish)'를 의미함
        let action = (currentMode === 'create') ? 'add' : 'update';
        if (currentTab === 'road') action = 'publish';

        await sendData(action, newData);
        
        alert(currentTab === 'road' ? "게시되었습니다!" : "저장되었습니다.");
        closeEditorModal();
        await fetchData(); 
    } catch (e) {
        alert("오류 발생: " + e);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = (currentMode === 'create') ? "새 데이터 등록" : (currentTab === 'road' ? "수정 후 게시하기" : "수정사항 저장");
    }
});

deleteBtn.addEventListener('click', async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteBtn.innerText = "삭제 중...";
    deleteBtn.disabled = true;
    try {
        await sendData('delete', null);
        alert("삭제되었습니다.");
        closeEditorModal();
        await fetchData();
    } catch (e) {
        alert("삭제 실패");
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerText = "삭제";
    }
});

async function deleteItemFromCard(link) {
    if (!confirm("❗ 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.")) return;
    
    try {
        await sendData('delete', null, link); 
        alert("삭제되었습니다.");
        await fetchData();
    } catch (e) {
        alert("삭제 실패: " + e);
    }
}