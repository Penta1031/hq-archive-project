// ============================================================================
// ⚙️ Admin 설정 및 상태 관리
// ============================================================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbyc3mCili8avD0Kc8Nu5B9UmhWgUCtQDbLG3_mWJ4eqrgE42nvyWmZjblPQVVfdp2DP/exec';

let allData = [];
let filteredData = [];
let currentPage = 1;
let itemsPerPage = 30;
let sessionPassword = null;
let currentMode = 'create';
let selectedLink = null;

// 카테고리 옵션
const CATEGORY_OPTIONS = [
    '콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비',
    '우얘합', '하루의마무리', '라이브',
    '인스타그램', '릴스', '셀카', '투샷',
    '프롬혚쾌', '혚쾌버블',
    '레코딩로그', '만년썰전', '버킷리스트', '엔킷리스트', '승캠', '합주일지', '메이킹', '비하인드', '팬싸', '인터뷰', '방송', '공식컨텐츠', '예능',
    '질투', '친지마', '모음집', '입덕가이드', '연말결산', '필독', '월드컵'
].sort();

// [요청사항 반영] 고정 키워드 목록
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

const editorModal = document.getElementById('editor-modal');
const editorModalBg = document.getElementById('editor-modal-bg');
const closeEditorBtn = document.getElementById('close-editor-btn');
const editorTitle = document.getElementById('editor-title');
const saveBtn = document.getElementById('save-btn');
const deleteBtn = document.getElementById('delete-btn');
const extractThumbBtn = document.getElementById('extract-thumb-btn');
const thumbnailPreview = document.getElementById('thumbnail-preview'); // 미리보기 이미지

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

function attemptLogin() {
    const pw = passwordInput.value;
    if (!pw) return alert("비밀번호를 입력하세요.");
    sessionPassword = pw;
    loginOverlay.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    initAdmin();
}

logoutBtn.addEventListener('click', () => {
    sessionPassword = null;
    location.reload();
});

async function initAdmin() {
    initCategorySelect();
    initKeywordSelect(); // [변경] 고정 키워드 로드
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

// [변경] 고정된 목록으로 키워드 옵션 생성
function initKeywordSelect() {
    inputs.keywords.innerHTML = '<option value="">선택하세요</option>';
    FIXED_KEYWORDS.forEach(kw => {
        const opt = document.createElement('option');
        opt.value = kw; 
        opt.innerText = kw;
        inputs.keywords.appendChild(opt);
    });
}

// 미리보기 업데이트 함수
function updateThumbnailPreview(url) {
    if (url && url.startsWith('http')) {
        thumbnailPreview.src = url;
        thumbnailPreview.classList.remove('hidden');
        thumbnailPreview.onerror = () => {
             // 이미지 로드 실패 시 숨김
             thumbnailPreview.classList.add('hidden');
        };
    } else {
        thumbnailPreview.src = '';
        thumbnailPreview.classList.add('hidden');
    }
}

// 썸네일 입력값 변경 시 미리보기 업데이트
inputs.thumbnail.addEventListener('input', (e) => updateThumbnailPreview(e.target.value));

itemsPerPageSelect.addEventListener('change', (e) => {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderList();
});

// ============================================================================
// 🖼️ 썸네일 자동 추출
// ============================================================================
async function tryExtractThumbnail() {
    const url = inputs.link.value.trim();
    if (!url) return;

    const originalBtnText = extractThumbBtn.innerText;
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
            updateThumbnailPreview(json.url); // 미리보기 즉시 반영
            extractThumbBtn.innerText = "✅";
            setTimeout(() => extractThumbBtn.innerText = "자동 추출", 2000);
        } else {
            console.log("Extraction info:", json.message);
            extractThumbBtn.innerText = "⚠️"; 
            setTimeout(() => extractThumbBtn.innerText = "자동 추출", 2000);
        }
    } catch (e) {
        console.error("썸네일 추출 오류:", e);
        extractThumbBtn.innerText = "❌";
        setTimeout(() => extractThumbBtn.innerText = "자동 추출", 2000);
    } finally {
        extractThumbBtn.disabled = false;
    }
}

inputs.link.addEventListener('blur', tryExtractThumbnail);
extractThumbBtn.addEventListener('click', tryExtractThumbnail);


// ============================================================================
// 📡 데이터 통신
// ============================================================================
async function fetchData() {
    listContainer.innerHTML = '<div class="text-center text-gray-500 mt-10"><i class="fas fa-spinner fa-spin"></i> 데이터 로딩 중...</div>';
    try {
        const res = await fetch(GOOGLE_SHEET_API_URL + '?type=full');
        const json = await res.json();
        
        allData = json.data.map(item => ({
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

        filteredData = allData;
        renderList();

    } catch (e) {
        alert("데이터 로드 실패: " + e.message);
        listContainer.innerHTML = '<div class="text-center text-red-500 mt-10">데이터 로드 실패</div>';
    }
}

async function sendData(action, data) {
    if (!sessionPassword) return alert("세션이 만료되었습니다.");

    const payload = {
        action: action,
        password: sessionPassword,
        link: action === 'add' ? null : selectedLink,
        data: data
    };

    try {
        await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            // ✅ 헤더를 제거하거나 'text/plain'으로 변경합니다.
            // GAS는 body가 JSON 문자열이면 parse할 수 있습니다.
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, 
            body: JSON.stringify(payload)
        });
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
}

// ============================================================================
// 📋 리스트 렌더링
// ============================================================================
// admin.js 파일에서 renderList() 함수 부분을 아래 코드로 교체하세요.

// ============================================================================
// 📋 리스트 렌더링 (모바일 레이아웃 개선 + 썸네일 추가)
// ============================================================================
function renderList() {
    listContainer.innerHTML = '';
    
    if (filteredData.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-gray-500 py-10">검색 결과가 없습니다.</div>';
        pageIndicator.innerText = `0 / 0`;
        return;
    }

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredData.slice(start, end);

    pageItems.forEach(item => {
        let displayDate = item.date;
        if (displayDate && displayDate.length > 10) {
            displayDate = displayDate.substring(0, 10);
        }

        const opacityClass = (item.isPublished === false || item.isPublished === 'FALSE') ? 'opacity-50' : '';
        const sourceInfo = item.account ? item.account : (item.original || '-');
        
        // 썸네일 처리: 있으면 이미지, 없으면 아이콘
        const thumbUrl = item.thumbnail;
        const thumbHtml = thumbUrl 
            ? `<img src="${thumbUrl}" class="w-full h-full object-cover hover:scale-110 transition duration-300" alt="thumb">`
            : `<div class="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600"><i class="fas fa-image"></i></div>`;

        const row = document.createElement('div');
        // [수정] 모바일/데스크탑 공통으로 썸네일을 왼쪽에 배치하는 Flex 레이아웃 사용
        row.className = `flex items-center px-4 py-3 border-b border-gray-800 hover:bg-[#1e1e1e] cursor-pointer transition group ${opacityClass}`;
        
        row.innerHTML = `
            <div class="w-20 h-12 md:w-24 md:h-14 shrink-0 rounded overflow-hidden mr-3 md:mr-4 border border-gray-700 bg-gray-900">
                ${thumbHtml}
            </div>

            <div class="flex-1 min-w-0 flex flex-col justify-center">
                <div class="flex items-center gap-2 mb-1">
                     <span class="shrink-0 text-[10px] md:text-xs px-1.5 py-0.5 rounded bg-gray-800 text-red-400 border border-gray-700 font-bold">${item.category || '기타'}</span>
                     <h4 class="text-xs md:text-sm font-bold text-gray-200 truncate group-hover:text-white transition">${item.title}</h4>
                </div>
                <div class="flex items-center text-[10px] md:text-xs text-gray-500 gap-2">
                    <span class="font-mono text-gray-400">${displayDate || '-'}</span>
                    <span class="w-[1px] h-2 bg-gray-700"></span>
                    <span class="truncate max-w-[100px] md:max-w-none">${sourceInfo}</span>
                </div>
            </div>

            <div class="hidden md:block ml-2 text-gray-600 group-hover:text-white transition"><i class="fas fa-chevron-right"></i></div>
        `;
        row.onclick = () => selectItem(item);
        listContainer.appendChild(row);
    });

    pageIndicator.innerText = `${currentPage} / ${totalPages}`;
    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
    prevPageBtn.style.opacity = currentPage === 1 ? 0.5 : 1;
    nextPageBtn.style.opacity = currentPage === totalPages ? 0.5 : 1;
}

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    filteredData = allData.filter(item => 
        item.title.toLowerCase().includes(query) || 
        (item.searchKeywords && item.searchKeywords.toLowerCase().includes(query))
    );
    currentPage = 1;
    renderList();
});

prevPageBtn.onclick = () => { if (currentPage > 1) { currentPage--; renderList(); } };
nextPageBtn.onclick = () => { if (currentPage < Math.ceil(filteredData.length / itemsPerPage)) { currentPage++; renderList(); } };


// ============================================================================
// 📝 에디터 (모달) 로직
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
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !editorModal.classList.contains('hidden')) {
        closeEditorModal();
    }
});

function resetFormInputs() {
    Object.values(inputs).forEach(input => input.value = '');
    inputs.year.value = new Date().getFullYear();
    extractThumbBtn.innerText = "자동 추출";
    updateThumbnailPreview(''); // 미리보기 초기화
}

function selectItem(item) {
    currentMode = 'update';
    selectedLink = item.link;
    editorTitle.innerText = "데이터 수정";
    deleteBtn.classList.remove('hidden');
    saveBtn.innerText = "수정사항 저장";
    saveBtn.classList.replace('bg-red-600', 'bg-blue-600');
    saveBtn.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');

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
    inputs.published.checked = (item.isPublished === true || item.isPublished === 'TRUE' || item.isPublished === '');

    updateThumbnailPreview(item.thumbnail); // 미리보기 갱신

    openEditorModal();
}

function resetEditor() {
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
}

createNewBtn.addEventListener('click', resetEditor);

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
    if (currentMode === 'update' && !selectedLink) return alert("수정 대상을 찾을 수 없습니다.");
    if (!confirm(currentMode === 'create' ? "새 데이터를 등록하시겠습니까?" : "수정사항을 저장하시겠습니까?")) return;

    saveBtn.disabled = true;
    saveBtn.innerText = "처리 중...";

    const action = currentMode === 'create' ? 'add' : 'update';
    
    try {
        await sendData(action, newData);
        alert("성공적으로 저장되었습니다.");
        closeEditorModal();
        await fetchData(); 
    } catch (e) {
        alert("저장 중 오류가 발생했습니다.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = currentMode === 'create' ? "새 데이터 등록" : "수정사항 저장";
    }
});

deleteBtn.addEventListener('click', async () => {
    if (!selectedLink) return;
    if (!confirm("❗ 정말 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.")) return;

    deleteBtn.disabled = true;
    deleteBtn.innerText = "삭제 중...";
    try {
        await sendData('delete', null);
        alert("삭제되었습니다.");
        closeEditorModal();
        await fetchData();
    } catch (e) {
        alert("삭제 실패");
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt mr-1"></i> 삭제';
    }
});