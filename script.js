// 🚨 본인의 웹 앱 URL로 유지하세요!
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbx0JfRUmY39YAVaRhajoX21zQ4ld1S3XYJMd-8-u6oUhG7QTisbl5hGmgCrPZZuIVsx/exec';
const ADMIN_PASSWORD = '1234';

// ============================================================
// 📌 설정 변수들 (매핑 및 리스트)
// ============================================================
const CATEGORY_GROUPS = {
    '무대 모음집': ['콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비', '무대', '직캠'],
    '라이브 모음집': ['우얘합', '하루의마무리', '단체라이브', '개인라이브', '라이브'],
    '투샷 모음집': ['인스타그램', '릴스', '셀카', '투샷', '사진'],
    '메시지 모음집': ['프롬혚쾌', '혚쾌버블', '버블', '메시지'],
    '미디어 모음집': ['팬싸', '인터뷰', '자체컨텐츠', '방송', '공식컨텐츠', '자컨', '예능']
};

const REVERSE_LOOKUP = {};
for (const [collection, items] of Object.entries(CATEGORY_GROUPS)) {
    items.forEach(item => REVERSE_LOOKUP[item] = collection);
}

const TAB_MAPPING = {
    '입덕가이드': 'must-read', '연말결산': 'must-read', '필독': 'must-read',
    '질투': 'newbie', '친지마': 'newbie', '모음집': 'newbie', '혚쾌 키워드': 'newbie',
    '무대 모음집': 'archive', '라이브 모음집': 'archive', '투샷 모음집': 'archive', 
    '메시지 모음집': 'archive', '미디어 모음집': 'archive'
};

const NEWBIE_COLLECTIONS = ['질투', '친지마', '모음집'];
const ARCHIVE_COLLECTIONS = ['무대 모음집', '라이브 모음집', '투샷 모음집', '메시지 모음집', '미디어 모음집'];

// 전역 변수
let contentsData = [];
let currentMainTab = 'must-read'; 
let currentCollection = 'All';    
let selectedCategories = new Set(); 
let currentPage = 1;
const ITEMS_PER_PAGE = 24;
let isAdminMode = false;

// DOM 요소
const mainAppArea = document.getElementById('main-app-area'); // 메인 앱 영역
const contentList = document.getElementById('content-list');
const loadMoreButton = document.getElementById('load-more-button');
const loadMoreContainer = document.getElementById('load-more-container');
const subCategoryList = document.getElementById('sub-category-list'); 
const keywordFilterSection = document.getElementById('keyword-filter-section'); 
const noResultsMsg = document.getElementById('no-results');
const heroSection = document.getElementById('hero-section');

/** 앱 초기화 */
async function initApp() {
    console.log("App Start...");
    
    // 1. 초기 UI 이벤트 연결 (데이터 로딩 전에도 버튼은 작동해야 함)
    setupEventListeners();

    // 2. 데이터 로드 (백그라운드에서 진행)
    const rawData = await fetchGoogleSheetData();
    if (rawData) {
        contentsData = processRawData(rawData.data);
        contentsData.sort((a, b) => new Date(b.date) - new Date(a.date)); 
        applySiteConfig(rawData.config);
        
        // 데이터 로드 완료 후 렌더링
        renderMainTabs();
        refreshView();
    }
}

/** 데이터 가공 */
function processRawData(data) {
    return data.map(item => {
        const title = (item['제목'] || item['title'] || '').trim();
        if (!title) return null;

        const link = (item['링크'] || item['link'] || '').trim();
        const rawDate = item['날짜'] || item['date'] || '';
        const thumb = item['썸네일'] || item['thumbnail'] || '';
        const rawCategoryStr = (item['카테고리'] || item['category'] || '').trim();
        const categoryList = rawCategoryStr.split(',').map(k => k.trim()).filter(k => k !== '');

        let collectionName = '기타';
        if (categoryList.length > 0) {
            const firstCat = categoryList[0];
            if (['질투', '친지마', '모음집'].includes(firstCat)) collectionName = firstCat;
            else if (['입덕가이드', '연말결산', '필독'].includes(firstCat)) collectionName = firstCat;
            else collectionName = REVERSE_LOOKUP[firstCat] || '기타';
        }

        let targetTab = TAB_MAPPING[collectionName] || 'archive';

        return {
            title, link, date: rawDate,
            mainTab: targetTab,
            collection: collectionName,
            categoryList: categoryList,
            thumbnail: thumb
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
        tabData.forEach(item => { if(item.collection && item.collection !== '기타') uniqueCols.add(item.collection); });
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
    contentList.innerHTML = '';
    
    let result = contentsData.filter(item => item.mainTab === currentMainTab);
    if (currentCollection !== 'All') result = result.filter(item => item.collection === currentCollection);
    if (selectedCategories.size > 0) result = result.filter(item => item.categoryList.some(c => selectedCategories.has(c)));

    if (result.length === 0) {
        // 데이터 로드 중이 아닐 때만 '결과 없음' 표시
        if (contentsData.length > 0) noResultsMsg.classList.remove('hidden');
        loadMoreContainer.classList.add('hidden');
        return;
    }
    noResultsMsg.classList.add('hidden');

    const endIndex = currentPage * ITEMS_PER_PAGE;
    result.slice(0, endIndex).forEach(item => {
        const card = document.createElement('div');
        card.className = "group bg-[#181818] rounded overflow-hidden shadow-lg hover:scale-105 transition duration-300 cursor-pointer relative";
        card.onclick = () => window.open(item.link, '_blank');

        let thumbnailHtml = `<div class="h-32 md:h-40 bg-gray-800 flex items-center justify-center"><i class="fas fa-play text-3xl text-gray-600"></i></div>`;
        if (item.thumbnail) thumbnailHtml = `<img src="${item.thumbnail}" class="w-full h-32 md:h-40 object-cover" alt="${item.title}">`;

        const tagsHtml = item.categoryList.slice(0, 2).map(c => `<span class="text-[10px] bg-gray-700 text-gray-300 px-1 rounded">#${c}</span>`).join('');

        card.innerHTML = `
            ${thumbnailHtml}
            <div class="p-3 md:p-4">
                <div class="flex flex-wrap gap-1 mb-2 items-center">
                    <span class="text-[10px] font-bold text-red-500 border border-red-500 px-1 rounded truncate max-w-[80px] mr-1">${item.collection}</span>
                    ${tagsHtml}
                </div>
                <h3 class="text-sm md:text-base font-bold text-white leading-snug mb-1 truncate">${item.title}</h3>
                <p class="text-xs text-gray-500">${item.date ? item.date.split('T')[0] : ''}</p>
            </div>
        `;
        contentList.appendChild(card);
    });
    
    if (endIndex >= result.length) loadMoreContainer.classList.add('hidden');
    else loadMoreContainer.classList.remove('hidden');
}

function applySiteConfig(config) {
    if (!config) return;
    if (config.hero_title) document.getElementById('hero-title').innerText = config.hero_title;
    if (config.hero_subtitle) document.getElementById('hero-subtitle').innerText = config.hero_subtitle;
    if (config.hero_desc) document.getElementById('hero-desc').innerText = config.hero_desc;
    if (config.hero_bg) heroSection.style.backgroundImage = `url('${config.hero_bg}')`;
}

/** ✨ 이벤트 리스너 (시청하기 버튼 로직 포함) ✨ */
function setupEventListeners() {
    // 1. 시청하기 버튼: 숨겨진 메인 앱 영역 보여주기
    document.getElementById('watch-button').onclick = () => {
        mainAppArea.classList.remove('hidden');
        // 부드럽게 나타나는 효과를 위해 약간의 지연 후 opacity 변경
        setTimeout(() => {
            mainAppArea.classList.remove('opacity-0');
            mainAppArea.scrollIntoView({ behavior: 'smooth' });
        }, 100);
        
        // 혚쾌러 필독 > 전체보기로 강제 이동 (초기화)
        currentMainTab = 'must-read';
        currentCollection = 'All';
        renderMainTabs();
        refreshView();
    };

    // 2. 상세 정보 버튼: 알림 띄우기
    document.getElementById('more-info-button').onclick = () => {
        alert("오류 및 문의사항은 @Penta_1031 로 제보 부탁드립니다.");
    };

    // 3. 관리자 모드
    document.getElementById('admin-login').onclick = () => {
        if (prompt("관리자 비밀번호:") === ADMIN_PASSWORD) {
            isAdminMode = true;
            document.getElementById('edit-bg-btn').classList.remove('hidden');
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            alert("관리자 모드");
        }
    };
    document.getElementById('edit-bg-btn').onclick = async () => {
        const newUrl = prompt("새 배경 URL:", heroSection.style.backgroundImage.slice(5, -2));
        if (newUrl) await sendUpdate('update_config', { key: 'hero_bg', value: newUrl });
    };
    
    // 4. 더 보기 버튼
    loadMoreButton.onclick = () => { currentPage++; renderContent(); };
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