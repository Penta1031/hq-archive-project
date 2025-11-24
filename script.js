// ============================================================================
// ⚙️ 설정 영역
// ============================================================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbx0JfRUmY39YAVaRhajoX21zQ4ld1S3XYJMd-8-u6oUhG7QTisbl5hGmgCrPZZuIVsx/exec';
const ADMIN_PASSWORD = '1234';

const CATEGORY_GROUPS = {
    '무대 모음집': ['콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비', '무대', '직캠'],
    '라이브 모음집': ['우얘합', '하루의마무리', '단체라이브', '개인라이브', '라이브'],
    '투샷 모음집': ['인스타그램', '릴스', '셀카', '투샷', '사진'],
    '메시지 모음집': ['프롬혚쾌', '혚쾌버블', '버블', '메시지'],
    '미디어 모음집': ['팬싸', '인터뷰', '자체컨텐츠', '방송', '공식컨텐츠', '자컨', '예능', '레코딩로그', '만년썰전', '버킷리스트', '엔킷리스트', '승캠']
};

const REVERSE_LOOKUP = {};
for (const [collection, items] of Object.entries(CATEGORY_GROUPS)) {
    items.forEach(item => REVERSE_LOOKUP[item] = collection);
}

const TAB_MAPPING = {
    '입덕가이드': 'must-read', '연말결산': 'must-read', '필독': 'must-read',
    '질투': 'newbie', '친지마': 'newbie', '모음집': 'newbie', '혚쾌 키워드': 'newbie', '뉴비': 'newbie',
    '무대 모음집': 'archive', '라이브 모음집': 'archive', '투샷 모음집': 'archive', 
    '메시지 모음집': 'archive', '미디어 모음집': 'archive'
};

const NEWBIE_COLLECTIONS = ['질투', '친지마', '모음집'];
const ARCHIVE_COLLECTIONS = ['무대 모음집', '라이브 모음집', '투샷 모음집', '메시지 모음집', '미디어 모음집'];


// ============================================================================
// 🚀 전역 변수
// ============================================================================
let contentsData = [];
let currentMainTab = 'must-read'; 
let currentCollection = 'All';    
let selectedCategories = new Set(); 
let searchQuery = ''; 
let currentPage = 1;
const ITEMS_PER_PAGE = 24;
let isAdminMode = false;

// DOM 요소
const mainAppArea = document.getElementById('main-app-area');
const scrollTarget = document.getElementById('scroll-target');
const contentList = document.getElementById('content-list');
const loadMoreButton = document.getElementById('load-more-button');
const loadMoreContainer = document.getElementById('load-more-container');
const subCategoryList = document.getElementById('sub-category-list'); 
const keywordFilterSection = document.getElementById('keyword-filter-section'); 
const noResultsMsg = document.getElementById('no-results');
const heroSection = document.getElementById('hero-section');
const searchInput = document.getElementById('search-input');

// ============================================================================
// 🚀 앱 초기화 (속도 최적화: 캐시 우선 로드)
// ============================================================================
async function initApp() {
    console.log("App Start...");
    setupEventListeners();

    // 1. ⚡ [핵심] 저장된 데이터가 있으면 즉시 로드 (0초 컷)
    const cachedData = localStorage.getItem('hq_archive_data');
    const cachedConfig = localStorage.getItem('hq_archive_config');

    if (cachedData) {
        console.log("⚡ 캐시 데이터 로드 완료");
        const parsedData = JSON.parse(cachedData);
        contentsData = processRawData(parsedData);
        contentsData.sort((a, b) => dateSort(a, b));
        
        if(cachedConfig) applySiteConfig(JSON.parse(cachedConfig));
        
        renderMainTabs();
        refreshView();
    }

    // 2. 백그라운드에서 최신 데이터 가져와서 업데이트 (사용자는 모르게)
    const rawData = await fetchGoogleSheetData();
    if (rawData) {
        console.log("🌐 최신 데이터 업데이트 완료");
        // 데이터 저장 (다음 접속을 위해)
        localStorage.setItem('hq_archive_data', JSON.stringify(rawData.data));
        localStorage.setItem('hq_archive_config', JSON.stringify(rawData.config));

        contentsData = processRawData(rawData.data);
        contentsData.sort((a, b) => dateSort(a, b));
        applySiteConfig(rawData.config);
        
        // UI 살짝 갱신 (보고 있던 화면이 튀지 않게 조심)
        // 검색 중이거나 페이지 넘긴 상태면 갱신 보류할 수도 있으나, 일단은 강제 갱신
        refreshView();
    }
}

// 날짜 정렬 함수 분리
function dateSort(a, b) {
    const dateA = a.date ? new Date(String(a.date).replace(/[./]/g, '-')).getTime() : 0;
    const dateB = b.date ? new Date(String(b.date).replace(/[./]/g, '-')).getTime() : 0;
    return dateB - dateA;
}

function processRawData(data) {
    return data.map(item => {
        const title = (item['제목'] || item['title'] || '').trim();
        if (!title) return null;

        const link = (item['링크'] || item['link'] || '').trim();
        const rawDate = item['날짜'] || item['date'] || '';
        const thumb = item['썸네일'] || item['thumbnail'] || '';
        const rawCategoryStr = (item['카테고리'] || item['category'] || '').trim();
        const categoryList = rawCategoryStr.split(',').map(k => k.trim()).filter(k => k !== '');

        const year = (item['연도'] || '').trim();
        const month = (item['월별'] || '').replace('월', '').trim();
        const searchKw = (item['서치 키워드'] || '').trim();
        const keywords = (item['키워드'] || '').trim();

        let dateDisplay = rawDate; 
        if (year && month) dateDisplay = `${year}.${month.padStart(2, '0')}`;
        else if (year) dateDisplay = year;
        else if (rawDate) dateDisplay = rawDate.replace(/-/g, '.');

        let collectionName = '기타';
        let targetTab = 'archive';

        if (categoryList.some(c => ['입덕가이드', '연말결산', '필독'].includes(c))) {
            targetTab = 'must-read';
            if (categoryList.includes('입덕가이드')) collectionName = '입덕가이드';
            else if (categoryList.includes('연말결산')) collectionName = '연말결산';
            else collectionName = '필독';
        }
        else if (categoryList.some(c => ['질투', '친지마', '모음집', '뉴비', '혚쾌 키워드'].includes(c))) {
            targetTab = 'newbie';
            if (categoryList.includes('질투')) collectionName = '질투';
            else if (categoryList.includes('친지마')) collectionName = '친지마';
            else if (categoryList.includes('모음집')) collectionName = '모음집';
            else collectionName = '기타';
        }
        else {
            targetTab = 'archive';
            for (const cat of categoryList) {
                if (REVERSE_LOOKUP[cat]) {
                    collectionName = REVERSE_LOOKUP[cat];
                    break;
                }
            }
        }

        return {
            title, link, date: rawDate,
            mainTab: targetTab,
            collection: collectionName,
            categoryList: categoryList,
            thumbnail: thumb,
            dateDisplay: dateDisplay,
            searchKeywords: searchKw,
            displayKeywords: keywords
        };
    }).filter(item => item !== null);
}

async function fetchGoogleSheetData() {
    try {
        const response = await fetch(GOOGLE_SHEET_API_URL);
        return await response.json();
    } catch (error) { return null; }
}

function refreshView() {
    renderCollections(); 
    renderCategories();  
    renderContent();     
}

function renderMainTabs() {
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        if (btn.dataset.tab === currentMainTab) {
            btn.classList.add('text-white', 'border-b-2', 'border-red-600');
            btn.classList.remove('text-gray-400');
        } else {
            btn.classList.add('text-gray-400');
            btn.classList.remove('text-white', 'border-b-2', 'border-red-600');
        }
        btn.onclick = () => {
            currentMainTab = btn.dataset.tab;
            currentCollection = 'All'; 
            selectedCategories.clear();
            searchQuery = ''; 
            searchInput.value = '';
            currentPage = 1;
            renderMainTabs();
            refreshView();
        };
    });
}

function renderCollections() {
    subCategoryList.innerHTML = '';
    let listToShow = ['All'];

    if (currentMainTab === 'archive') listToShow = ['All', ...ARCHIVE_COLLECTIONS];
    else if (currentMainTab === 'newbie') listToShow = ['All', ...NEWBIE_COLLECTIONS];
    else {
        const tabData = contentsData.filter(item => item.mainTab === currentMainTab);
        const uniqueCols = new Set();
        tabData.forEach(item => {
            if(item.collection && item.collection !== '기타') uniqueCols.add(item.collection);
        });
        listToShow = ['All', ...Array.from(uniqueCols).sort()];
    }

    listToShow.forEach(col => {
        const label = col === 'All' ? '전체 보기' : col;
        const btn = document.createElement('button');
        const isActive = (currentCollection === col);
        
        btn.className = `shrink-0 px-4 py-2 text-sm md:text-base font-bold transition duration-200 rounded-full mr-2 ${
            isActive ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }`;
        btn.innerText = label;
        btn.onclick = () => {
            currentCollection = col;
            selectedCategories.clear();
            currentPage = 1;
            refreshView();
        };
        subCategoryList.appendChild(btn);
    });
}

function renderCategories() {
    keywordFilterSection.innerHTML = '';

    if (currentMainTab === 'newbie' && currentCollection === '모음집') {
        keywordFilterSection.classList.add('hidden');
        return;
    }

    let filteredData = contentsData.filter(item => item.mainTab === currentMainTab);
    if (currentCollection !== 'All') filteredData = filteredData.filter(item => item.collection === currentCollection);
    
    const availableCats = new Set();
    filteredData.forEach(item => item.categoryList.forEach(c => availableCats.add(c)));

    let displayList = [];
    if (CATEGORY_GROUPS[currentCollection]) {
        displayList = CATEGORY_GROUPS[currentCollection].filter(c => availableCats.has(c));
        const extras = Array.from(availableCats).filter(c => !CATEGORY_GROUPS[currentCollection].includes(c));
        displayList = [...displayList, ...extras.sort()];
    } else {
        displayList = Array.from(availableCats).sort();
    }

    if (displayList.length === 0) {
        keywordFilterSection.classList.add('hidden');
        return;
    }
    keywordFilterSection.classList.remove('hidden');
    
    const label = document.createElement('span');
    label.className = "text-gray-500 text-sm flex items-center mr-2";
    label.innerHTML = `<i class="fas fa-filter mr-1"></i> 카테고리:`;
    keywordFilterSection.appendChild(label);

    displayList.forEach(cat => {
        const btn = document.createElement('button');
        const isSelected = selectedCategories.has(cat);
        btn.className = `text-xs md:text-sm px-3 py-1 rounded-full border transition duration-200 mb-1 ${
            isSelected ? 'bg-red-600 border-red-600 text-white' : 'bg-transparent border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white'
        }`;
        btn.innerText = cat;
        btn.onclick = () => {
            if (selectedCategories.has(cat)) selectedCategories.delete(cat);
            else selectedCategories.add(cat);
            currentPage = 1;
            renderCategories();
            renderContent();
        };
        keywordFilterSection.appendChild(btn);
    });
}

function renderContent() {
    let result = contentsData.filter(item => item.mainTab === currentMainTab);
    if (currentCollection !== 'All') {
        result = result.filter(item => item.collection === currentCollection);
    }
    if (selectedCategories.size > 0) {
        result = result.filter(item => item.categoryList.some(c => selectedCategories.has(c)));
    }
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        result = result.filter(item => 
            item.title.toLowerCase().includes(query) || 
            item.categoryList.some(c => c.toLowerCase().includes(query)) ||
            (item.date && item.date.includes(query)) ||
            (item.searchKeywords && item.searchKeywords.toLowerCase().includes(query)) 
        );
    }

    result.sort((a, b) => dateSort(a, b));

    if (result.length === 0) {
        contentList.innerHTML = '';
        if (contentsData.length > 0) noResultsMsg.classList.remove('hidden');
        loadMoreContainer.classList.add('hidden');
        return;
    }
    noResultsMsg.classList.add('hidden');

    const endIndex = currentPage * ITEMS_PER_PAGE;
    const itemsToRender = result.slice(0, endIndex);
    
    const htmlBuffer = itemsToRender.map(item => {
        let thumbnailHtml = `<div class="aspect-video bg-gray-800 flex items-center justify-center"><i class="fas fa-play text-2xl text-gray-600"></i></div>`;
        if (item.thumbnail) {
            thumbnailHtml = `<div class="aspect-video overflow-hidden"><img src="${item.thumbnail}" class="w-full h-full object-cover transition duration-500 group-hover:brightness-110" alt="${item.title}" loading="lazy"></div>`;
        }

        let keywordBadges = '';
        if (item.searchKeywords) keywordBadges += `<span class="text-gray-400 mr-1">#${item.searchKeywords}</span>`;
        if (item.displayKeywords) keywordBadges += `<span class="text-gray-500">#${item.displayKeywords}</span>`;

        return `
            <div class="group bg-[#181818] rounded-md overflow-hidden cursor-pointer relative transition duration-300 hover:z-10 hover:scale-105 hover:shadow-xl" onclick="window.open('${item.link}', '_blank')">
                ${thumbnailHtml}
                <div class="p-2">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[9px] font-bold text-red-500 border border-red-500 px-1 rounded tracking-tight truncate max-w-[70px]">${item.collection}</span>
                        <span class="text-[9px] text-gray-300 bg-gray-800 px-1.5 py-0.5 rounded">${item.dateDisplay || '-'}</span>
                    </div>
                    <h3 class="text-xs md:text-sm font-bold text-gray-200 leading-tight line-clamp-2 group-hover:text-white mb-1">${item.title}</h3>
                    <div class="text-[9px] leading-tight line-clamp-1">
                        ${keywordBadges}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    contentList.innerHTML = htmlBuffer;
    
    if (endIndex >= result.length) loadMoreContainer.classList.add('hidden');
    else loadMoreContainer.classList.remove('hidden');
}

function setupEventListeners() {
    const watchBtn = document.getElementById('watch-button');
    if(watchBtn) {
        watchBtn.onclick = () => {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
    }

    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            currentPage = 1;
            renderContent();
        });
    }

    document.getElementById('more-info-button').onclick = () => alert("오류 및 문의사항은 @Penta_1031 로 제보 부탁드립니다.");
    
    document.getElementById('admin-login').onclick = () => {
        if (prompt("관리자 비밀번호:") === ADMIN_PASSWORD) {
            isAdminMode = true;
            document.getElementById('edit-bg-btn').classList.remove('hidden');
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            alert("관리자 모드 활성화");
        }
    };

    document.getElementById('edit-bg-btn').onclick = async () => {
        const newUrl = prompt("새 배경 URL:", heroSection.style.backgroundImage.slice(5, -2));
        if (newUrl) await sendUpdate('update_config', { key: 'hero_bg', value: newUrl });
    };
    
    loadMoreButton.onclick = () => { currentPage++; renderContent(); };
}

function applySiteConfig(config) {
    if (!config) return;
    if (config.hero_title) document.getElementById('hero-title').innerText = config.hero_title;
    if (config.hero_subtitle) document.getElementById('hero-subtitle').innerText = config.hero_subtitle;
    if (config.hero_desc) document.getElementById('hero-desc').innerText = config.hero_desc;
    if (config.hero_bg) heroSection.style.backgroundImage = `url('${config.hero_bg}')`;
}

async function sendUpdate(action, payload) {
    await fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
    });
    location.reload();
}

window.editConfig = async function(key) { if (isAdminMode) alert("시트에서 수정하세요."); };
document.addEventListener('DOMContentLoaded', initApp);