// ============================================================================
// ⚙️ 설정 영역
// ============================================================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbx0JfRUmY39YAVaRhajoX21zQ4ld1S3XYJMd-8-u6oUhG7QTisbl5hGmgCrPZZuIVsx/exec';
// ❌ ADMIN_PASSWORD 변수 삭제됨 (코드에 비번 안 남김)

// 📌 기본 분류 규칙
let CATEGORY_GROUPS = {
    '무대 모음집': ['콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비'],
    '라이브 모음집': ['우얘합', '하루의마무리', '라이브'],
    '투샷 모음집': ['인스타그램', '릴스', '셀카', '투샷'],
    '메시지 모음집': ['프롬혚쾌', '혚쾌버블'],
    '미디어 모음집': ['레코딩로그', '만년썰전', '버킷리스트', '엔킷리스트', '승캠', '합주일지', '메이킹', '비하인드', '팬싸', '인터뷰', '방송', '공식컨텐츠', '예능']
};

let REVERSE_LOOKUP = {};
function buildReverseLookup() {
    REVERSE_LOOKUP = {};
    for (const [collection, items] of Object.entries(CATEGORY_GROUPS)) {
        items.forEach(item => REVERSE_LOOKUP[item] = collection);
    }
}
buildReverseLookup();

const TAB_MAPPING = {
    '입덕가이드': 'must-read', '연말결산': 'must-read', '필독': 'must-read', '월드컵': 'must-read',
    '무대 모음집': 'archive', '라이브 모음집': 'archive', '투샷 모음집': 'archive', 
    '메시지 모음집': 'archive', '미디어 모음집': 'archive'
};

let NEWBIE_COLLECTIONS = [
    { id: '질투', name: '질투' }, 
    { id: '친지마', name: '친지마' }, 
    { id: '모음집', name: '모음집' }
];


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
let sessionPassword = null; // 🔐 입력한 비밀번호를 임시 저장할 변수

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
const addTagButton = document.getElementById('add-tag-button');

// 캘린더 DOM
const calendarSection = document.getElementById('calendar-section');
const calendarTitleText = document.getElementById('calendar-title-text');
const calendarTitleBtn = document.getElementById('calendar-title-btn');
const datePicker = document.getElementById('date-picker');
const yearSelect = document.getElementById('year-select');
const monthSelect = document.getElementById('month-select');
const applyDateBtn = document.getElementById('apply-date-btn');
const calendarGrid = document.getElementById('calendar-grid');
const selectedDateTitle = document.getElementById('selected-date-title');

let calendarDate = new Date();
let selectedDate = null;

// ============================================================================
// 🚀 앱 초기화
// ============================================================================
async function initApp() {
    console.log("App Start...");
    setupEventListeners();
    initDatePicker();

    const cachedRules = localStorage.getItem('hq_archive_rules');
    if (cachedRules) {
        try {
            const rules = JSON.parse(cachedRules);
            applyCategoryRules(rules);
        } catch(e) {}
    }

    const cachedData = localStorage.getItem('hq_archive_data');
    const cachedConfig = localStorage.getItem('hq_archive_config');

    if (cachedData) {
        const parsedData = JSON.parse(cachedData);
        contentsData = processRawData(parsedData);
        contentsData.sort((a, b) => dateSort(a, b));
        if(cachedConfig) applySiteConfig(JSON.parse(cachedConfig));
        renderMainTabs();
        refreshView();
    }

    fetchGoogleSheetData('fast').then(rawData => {
        if (rawData && contentsData.length === 0) {
            updateDataAndRender(rawData);
        }
    });

    const fullRawData = await fetchGoogleSheetData('full');
    if (fullRawData) {
        updateDataAndRender(fullRawData);
        localStorage.setItem('hq_archive_data', JSON.stringify(fullRawData.data));
        localStorage.setItem('hq_archive_config', JSON.stringify(fullRawData.config));
    }
}

// ➕ 데이터 추가 함수
async function addNewData() {
    // 🔐 작업을 할 때마다 비밀번호를 물어보거나, 로그인 시 저장한 비밀번호 사용
    if (!sessionPassword) sessionPassword = prompt("관리자 비밀번호를 입력하세요:");
    if (!sessionPassword) return;

    const title = prompt("제목을 입력하세요:");
    if (!title) return;
    
    const link = prompt("링크(URL)를 입력하세요:");
    if (!link) return;

    const date = prompt("날짜를 입력하세요 (YYYY-MM-DD):");
    const category = prompt("카테고리(I열)를 입력하세요 (예: 콘서트):");
    const keywords = prompt("키워드(D열)를 입력하세요 (선택사항):", "");
    const thumbnail = prompt("썸네일 URL (선택사항 - 비워두면 자동):", "");

    if (confirm(`[확인]\n제목: ${title}\n링크: ${link}\n저장하시겠습니까?`)) {
        await sendSheetRequest({
            action: 'add',
            password: sessionPassword, // 입력받은 비밀번호 전송
            data: {
                title: title,
                link: link,
                date: date,
                category: category,
                keywords: keywords,
                thumbnail: thumbnail
            }
        });
        alert("요청 완료. (비밀번호가 틀렸으면 반영되지 않습니다)");
        location.reload();
    }
}

// ✏️ 수정 함수
async function editItem(item) {
    if (!sessionPassword) sessionPassword = prompt("관리자 비밀번호를 입력하세요:");
    if (!sessionPassword) return;

    const newTitle = prompt("제목 수정:", item.title);
    if (newTitle === null) return;
    const newDate = prompt("날짜 수정 (YYYY-MM-DD):", item.date);
    if (newDate === null) return;
    const newCategory = prompt("카테고리(I열) 수정:", item.rawCategoryStr);
    if (newCategory === null) return;
    const newKeywords = prompt("키워드(D열) 수정:", item.rawKeywordsStr);
    if (newKeywords === null) return;

    await sendSheetRequest({
        action: 'update',
        link: item.link,
        password: sessionPassword,
        data: { title: newTitle, date: newDate, category: newCategory, keywords: newKeywords }
    });
    alert("수정 요청 완료.");
    location.reload();
}

// 🗑️ 삭제 함수
async function deleteItem(link) {
    if (!confirm("정말 삭제하시겠습니까? (복구 불가)")) return;
    
    if (!sessionPassword) sessionPassword = prompt("관리자 비밀번호를 입력하세요:");
    if (!sessionPassword) return;

    await sendSheetRequest({ action: 'delete', link: link, password: sessionPassword });
    alert("삭제 요청 완료.");
    location.reload();
}

// API 요청 공통
async function sendSheetRequest(payload) {
    try {
        await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (e) {
        alert("오류 발생: " + e);
    }
}

// ... (중간 로직들은 동일) ...

function applyCategoryRules(rules) {
    if (rules['뉴비 구성']) {
        NEWBIE_COLLECTIONS = rules['뉴비 구성'].map(item => {
            if (typeof item === 'string' && item.includes(':')) {
                const [key, label] = item.split(':');
                return { id: key.trim(), name: label.trim() };
            }
            return { id: item.trim(), name: item.trim() };
        });
        NEWBIE_COLLECTIONS.forEach(obj => { TAB_MAPPING[obj.id] = 'newbie'; });
        delete rules['뉴비 구성'];
    }
    if (Object.keys(rules).length > 0) {
        CATEGORY_GROUPS = rules;
    }
    buildReverseLookup();
    localStorage.setItem('hq_archive_rules', JSON.stringify(CATEGORY_GROUPS));
}

function updateDataAndRender(rawData) {
    if (rawData.categoryGroups && Object.keys(rawData.categoryGroups).length > 0) {
        applyCategoryRules(rawData.categoryGroups);
    }
    contentsData = processRawData(rawData.data);
    contentsData.sort((a, b) => dateSort(a, b));
    applySiteConfig(rawData.config);
    refreshView();
}

function dateSort(a, b) {
    const dateA = a.standardDate || '0000-00-00';
    const dateB = b.standardDate || '0000-00-00';
    return dateB.localeCompare(dateA);
}

function processRawData(data) {
    return data.map(item => {
        const title = (item['제목'] || item['title'] || '').trim();
        if (!title) return null;

        const link = (item['링크'] || item['link'] || '').trim();
        const rawDate = (item['날짜'] || item['date'] || '').trim();
        const thumb = item['썸네일'] || item['thumbnail'] || '';
        const rawCategoryStr = (item['카테고리'] || item['category'] || '').trim();
        const categoryList = rawCategoryStr.split(',').map(k => k.trim()).filter(k => k !== '');

        const year = (item['연도'] || '').trim();
        const month = (item['월별'] || '').replace('월', '').trim();
        const searchKw = (item['서치 키워드'] || '').trim();
        const keywords = (item['키워드'] || '').trim();

        let standardDate = '';
        let dateDisplay = rawDate;

        if (rawDate) {
            const cleanDate = rawDate.replace(/\./g, '-').replace(/\//g, '-');
            if (cleanDate.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
                const parts = cleanDate.split('-');
                standardDate = `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
                dateDisplay = standardDate.replace(/-/g, '.');
            } else { dateDisplay = rawDate; }
        } else if (year && month) {
            dateDisplay = `${year}.${month.padStart(2, '0')}`;
        } else if (year) { dateDisplay = year; }

        let collectionName = '기타';
        let targetTab = 'archive';

        if (categoryList.some(c => ['입덕가이드', '연말결산', '필독', '월드컵'].includes(c))) {
            targetTab = 'must-read';
            if (categoryList.includes('입덕가이드')) collectionName = '입덕가이드';
            else if (categoryList.includes('연말결산')) collectionName = '연말결산';
            else if (categoryList.includes('월드컵')) collectionName = '월드컵';
            else collectionName = '필독';
        }
        else if (categoryList.some(c => NEWBIE_COLLECTIONS.some(nc => nc.id === c) || ['뉴비', '혚쾌 키워드'].includes(c))) {
            targetTab = 'newbie';
            const matchObj = NEWBIE_COLLECTIONS.find(nc => categoryList.includes(nc.id));
            collectionName = matchObj ? matchObj.id : '기타';
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
            standardDate: standardDate,
            mainTab: targetTab,
            collection: collectionName,
            categoryList: categoryList,
            thumbnail: thumb,
            dateDisplay: dateDisplay,
            searchKeywords: searchKw,
            displayKeywords: keywords,
            rawCategoryStr: rawCategoryStr,
            rawKeywordsStr: keywords
        };
    }).filter(item => item !== null);
}

async function fetchGoogleSheetData(mode = 'full') {
    try {
        const url = `${GOOGLE_SHEET_API_URL}?mode=${mode}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) { return null; }
}

function refreshView() {
    if (currentMainTab === 'calendar') {
        renderCalendar();
        renderContent();
    } else {
        renderCollections(); 
        renderCategories();  
        renderContent();     
    }
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
            selectedDate = null;
            currentPage = 1;

            if (currentMainTab === 'calendar') {
                calendarSection.classList.remove('hidden');
                subCategoryList.classList.add('hidden');
                keywordFilterSection.classList.add('hidden');
            } else {
                calendarSection.classList.add('hidden');
                subCategoryList.classList.remove('hidden');
                keywordFilterSection.classList.remove('hidden');
                selectedDateTitle.classList.add('hidden');
            }

            renderMainTabs();
            refreshView();
        };
    });
}

function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    calendarTitleText.innerText = `${year}.${String(month + 1).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    calendarGrid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        calendarGrid.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= lastDate; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const cell = document.createElement('div');
        
        const hasData = contentsData.some(item => item.standardDate === dateStr);
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const isToday = (todayStr === dateStr);
        const isSelected = selectedDate === dateStr;

        cell.className = `aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition duration-200 border border-transparent hover:bg-gray-800 relative
            ${isSelected ? 'bg-gray-800 border-red-600 text-white' : 'text-gray-400'}
            ${isToday ? 'border-2 border-red-600 text-white font-bold' : 'border border-transparent'}
        `;
        
        cell.innerHTML = `<span class="text-sm md:text-lg font-bold ${isToday ? 'text-red-500' : ''}">${i}</span>`;
        if (hasData) cell.innerHTML += `<div class="w-1.5 h-1.5 bg-red-600 rounded-full mt-1"></div>`;

        cell.onclick = () => {
            if (selectedDate === dateStr) {
                selectedDate = null;
                selectedDateTitle.classList.add('hidden');
            } else {
                selectedDate = dateStr;
                selectedDateTitle.innerText = `📅 ${dateStr} 의 기록`;
                selectedDateTitle.classList.remove('hidden');
            }
            renderCalendar();
            renderContent();
        };
        calendarGrid.appendChild(cell);
    }
}

function initDatePicker() {
    if(!yearSelect || !monthSelect) return;
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = 2017; y <= currentYear + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.innerText = y + '년';
        if(y === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }
    monthSelect.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
        const opt = document.createElement('option');
        opt.value = m - 1; 
        opt.innerText = m + '월';
        monthSelect.appendChild(opt);
    }
}

function renderCollections() {
    if (currentMainTab === 'calendar') return;

    subCategoryList.innerHTML = '';
    let listToShow = ['All']; 

    if (currentMainTab === 'archive') {
        listToShow = [{id:'All', name:'전체 보기'}, ...Object.keys(CATEGORY_GROUPS).map(k => ({id:k, name:k}))];
    } else if (currentMainTab === 'newbie') {
        listToShow = [{id:'All', name:'전체 보기'}, ...NEWBIE_COLLECTIONS];
    } else {
        const tabData = contentsData.filter(item => item.mainTab === currentMainTab);
        const uniqueCols = new Set();
        tabData.forEach(item => {
            if(item.collection && item.collection !== '기타') uniqueCols.add(item.collection);
        });
        listToShow = [{id:'All', name:'전체 보기'}, ...Array.from(uniqueCols).sort().map(k => ({id:k, name:k}))];
    }

    listToShow.forEach(item => {
        const btn = document.createElement('button');
        const isActive = (currentCollection === item.id);
        
        btn.className = `shrink-0 px-4 py-2 text-sm md:text-base font-bold transition duration-200 rounded-full mr-2 ${
            isActive ? 'text-white bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
        }`;
        btn.innerText = item.name;
        btn.onclick = () => {
            currentCollection = item.id; 
            selectedCategories.clear();
            currentPage = 1;
            refreshView();
        };
        subCategoryList.appendChild(btn);
    });
}

function renderCategories() {
    if (currentMainTab === 'calendar') return;
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
        if (cat === currentCollection) return;

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

// ⚡ [수정됨] 렌더링 (관리자 모드일 때 수정/삭제 버튼 노출)
function renderContent() {
    contentList.innerHTML = '';
    let result = contentsData;

    if (currentMainTab === 'calendar') {
        if (selectedDate) {
            result = result.filter(item => item.standardDate === selectedDate);
        } else {
            const targetMonth = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
            result = result.filter(item => item.standardDate && item.standardDate.startsWith(targetMonth));
        }
    } else {
        result = result.filter(item => item.mainTab === currentMainTab);
        if (currentCollection !== 'All') {
            result = result.filter(item => item.collection === currentCollection);
        }
        if (selectedCategories.size > 0) {
            result = result.filter(item => item.categoryList.some(c => selectedCategories.has(c)));
        }
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
        if (contentsData.length > 0) {
            if (currentMainTab === 'calendar' && selectedDate) {
                noResultsMsg.innerHTML = `<p class="text-gray-500 text-lg">📅 ${selectedDate} 에 기록된 데이터가 없습니다.</p>`;
            } else {
                noResultsMsg.innerHTML = `<p class="text-gray-500 text-lg">검색 결과가 없습니다.</p>`;
            }
            noResultsMsg.classList.remove('hidden');
        }
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

        // 관리자 버튼 (수정/삭제)
        let adminBtns = '';
        if (isAdminMode) {
            const safeLink = item.link.replace(/'/g, "\\'"); 
            adminBtns = `
                <div class="absolute top-2 right-2 flex gap-1 z-20">
                    <button class="bg-blue-600 text-white p-1.5 rounded shadow hover:bg-blue-700 text-xs"
                        onclick="event.stopPropagation(); editItemByLink('${safeLink}')">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="bg-red-600 text-white p-1.5 rounded shadow hover:bg-red-700 text-xs"
                        onclick="event.stopPropagation(); deleteItem('${safeLink}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        }

        return `
            <div class="group bg-[#181818] rounded-md overflow-hidden cursor-pointer relative transition duration-300 hover:z-10 hover:scale-105 hover:shadow-xl" onclick="window.open('${item.link}', '_blank')">
                ${adminBtns}
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

// 헬퍼: 링크로 아이템 찾아서 수정 호출
window.editItemByLink = function(link) {
    const item = contentsData.find(i => i.link === link);
    if (item) editItem(item);
};

function setupEventListeners() {
    const watchBtn = document.getElementById('watch-button');
    if(watchBtn) {
        watchBtn.onclick = () => {
            const searchContainer = document.getElementById('search-input').parentElement.parentElement;
            if (searchContainer) {
                const y = searchContainer.getBoundingClientRect().top + window.pageYOffset - 20;
                window.scrollTo({top: y, behavior: 'smooth'});
            } else {
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
    }

    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            currentPage = 1;
            renderContent();
        });
    }

    document.getElementById('prev-month').onclick = () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
        renderContent();
    };
    document.getElementById('next-month').onclick = () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
        renderContent();
    };
    document.getElementById('today-btn').onclick = () => {
        calendarDate = new Date();
        selectedDate = new Date().toISOString().slice(0, 10);
        renderCalendar();
        renderContent();
    };

    if(calendarTitleBtn) {
        calendarTitleBtn.onclick = (e) => {
            e.stopPropagation();
            datePicker.classList.toggle('hidden');
            datePicker.classList.toggle('flex');
        };
    }

    if(applyDateBtn) {
        applyDateBtn.onclick = () => {
            const y = parseInt(yearSelect.value);
            const m = parseInt(monthSelect.value);
            calendarDate = new Date(y, m, 1);
            datePicker.classList.add('hidden');
            datePicker.classList.remove('flex');
            renderCalendar();
            renderContent();
        };
    }

    document.addEventListener('click', (e) => {
        if (datePicker && !datePicker.contains(e.target) && !calendarTitleBtn.contains(e.target)) {
            datePicker.classList.add('hidden');
            datePicker.classList.remove('flex');
        }
    });

    document.getElementById('more-info-button').onclick = () => alert("오류 및 문의사항은 @Penta_1031 로 제보 부탁드립니다.");
    
    // 관리자 로그인 복구
    const adminBtn = document.getElementById('admin-login');
    if (adminBtn) {
        adminBtn.style.display = 'block';
        adminBtn.onclick = () => {
            const pw = prompt("관리자 비밀번호:");
            // 서버 확인 과정 없이 일단 UI상으로 관리자 모드 진입 (실제 삭제 시 서버에서 비번 재확인함)
            if (pw) {
                sessionPassword = pw; // 세션에 저장
                isAdminMode = true;
                
                const editBgBtn = document.getElementById('edit-bg-btn');
                if(editBgBtn) {
                    editBgBtn.classList.remove('hidden');
                    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
                }
                
                if(addTagButton) {
                    addTagButton.classList.remove('hidden');
                    addTagButton.innerText = "+ 데이터 추가";
                    addTagButton.onclick = addNewData;
                }

                alert("관리자 모드 ON (추가/수정/삭제 가능)");
                renderContent(); 
            }
        };
    }

    // 배경 수정
    const editBgBtn = document.getElementById('edit-bg-btn');
    if(editBgBtn) {
        editBgBtn.onclick = async () => {
            const newUrl = prompt("새 배경 URL:", heroSection.style.backgroundImage.slice(5, -2));
            if (newUrl) await sendSheetRequest({ 
                action: 'update_config', 
                password: sessionPassword, 
                key: 'hero_bg', 
                value: newUrl 
            });
        };
    }
    
    loadMoreButton.onclick = () => { currentPage++; renderContent(); };
}

// Config 수정 (관리자)
window.editConfig = async function(key) { 
    if (!isAdminMode) return; 
    let currentVal = document.getElementById(key.replace('_', '-')).innerText;
    const newVal = prompt("수정할 내용:", currentVal);
    if (newVal && newVal !== currentVal) {
        await sendSheetRequest({
            action: 'update_config',
            password: sessionPassword,
            key: key,
            value: newVal
        });
    }
};

function applySiteConfig(config) {
    if (!config) return;
    if (config.hero_title) document.getElementById('hero-title').innerText = config.hero_title;
    if (config.hero_subtitle) document.getElementById('hero-subtitle').innerText = config.hero_subtitle;
    if (config.hero_desc) document.getElementById('hero-desc').innerText = config.hero_desc;
    if (config.hero_bg) heroSection.style.backgroundImage = `url('${config.hero_bg}')`;
}

document.addEventListener('DOMContentLoaded', initApp);