// ============================================================================
// ⚙️ 설정 영역
// ============================================================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbx0JfRUmY39YAVaRhajoX21zQ4ld1S3XYJMd-8-u6oUhG7QTisbl5hGmgCrPZZuIVsx/exec';

const CATEGORY_GROUPS = {
    '무대 모음집': ['콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비', '무대', '직캠'],
    '라이브 모음집': ['우얘합', '하루의마무리', '단체라이브', '개인라이브', '라이브'],
    '투샷 모음집': ['인스타그램', '릴스', '셀카', '투샷'],
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
const ITEMS_PER_PAGE = 30; // ⚡ 30개씩 로딩

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

// 캘린더 DOM
const calendarSection = document.getElementById('calendar-section');
const calendarTitle = document.getElementById('calendar-title');
const calendarGrid = document.getElementById('calendar-grid');
const selectedDateTitle = document.getElementById('selected-date-title');

// 캘린더 변수
let calendarDate = new Date();
let selectedDate = null;

// ============================================================================
// 🚀 앱 초기화
// ============================================================================
async function initApp() {
    console.log("App Start...");
    setupEventListeners();

    // 1. 캐시된 데이터 확인 (localStorage)
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

    // 2. ⚡ 빠른 로딩 (30개 먼저 가져오기)
    // 캐시가 없거나 업데이트가 필요할 때 빠르게 화면을 채움
    fetchGoogleSheetData('fast').then(rawData => {
        if (rawData && contentsData.length === 0) {
            console.log("⚡ Fast Load (30 items)");
            updateDataAndRender(rawData);
        }
    });

    // 3. 전체 로딩 (백그라운드)
    const fullRawData = await fetchGoogleSheetData('full');
    if (fullRawData) {
        console.log("🌐 Full Load Complete");
        updateDataAndRender(fullRawData);
        // 로컬 스토리지 업데이트
        localStorage.setItem('hq_archive_data', JSON.stringify(fullRawData.data));
        localStorage.setItem('hq_archive_config', JSON.stringify(fullRawData.config));
    }
}

function updateDataAndRender(rawData) {
    contentsData = processRawData(rawData.data);
    contentsData.sort((a, b) => dateSort(a, b));
    applySiteConfig(rawData.config);
    
    // 탭이 유지되도록 현재 뷰 갱신
    refreshView();
}

// 날짜 정렬 헬퍼
function dateSort(a, b) {
    // standardDate(YYYY-MM-DD) 기준으로 정렬
    if (!a.standardDate) return 1; // 날짜 없으면 뒤로
    if (!b.standardDate) return -1;
    return b.standardDate.localeCompare(a.standardDate);
}

// ✨ 데이터 가공 (날짜 로직 대폭 수정)
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

        // 🗓️ 캘린더용 표준 날짜 (YYYY-MM-DD) 만들기
        let standardDate = '';
        let dateDisplay = rawDate;

        // 1. rawDate가 있으면 그걸 최우선으로 파싱
        if (rawDate) {
            // 2025.10.31, 2025/10/31 -> 2025-10-31 로 통일
            const cleanDate = rawDate.replace(/\./g, '-').replace(/\//g, '-');
            // 유효한 날짜인지 체크
            if (!isNaN(Date.parse(cleanDate))) {
                standardDate = new Date(cleanDate).toISOString().split('T')[0];
                dateDisplay = cleanDate.replace(/-/g, '.'); // 화면 표시는 점(.)으로
            }
        } 
        // 2. rawDate가 없고 연/월만 있으면 (캘린더엔 표시 못함)
        else if (year && month) {
            dateDisplay = `${year}.${month.padStart(2, '0')}`;
        } 
        else if (year) {
            dateDisplay = year;
        }

        // 📂 분류 로직
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
            standardDate: standardDate, // 캘린더 매칭용 ID
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

async function fetchGoogleSheetData(mode = 'full') {
    try {
        const url = `${GOOGLE_SHEET_API_URL}?mode=${mode}`;
        const response = await fetch(url);
        return await response.json();
    } catch (error) { return null; }
}

function refreshView() {
    if (currentMainTab === 'scheduler') {
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
            
            // 탭 변경 시 초기화
            currentCollection = 'All'; 
            selectedCategories.clear();
            searchQuery = ''; 
            searchInput.value = '';
            selectedDate = null;
            currentPage = 1;

            if (currentMainTab === 'scheduler') {
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
    calendarTitle.innerText = `${year}.${String(month + 1).padStart(2, '0')}`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    
    calendarGrid.innerHTML = '';

    for (let i = 0; i < firstDay; i++) {
        calendarGrid.appendChild(document.createElement('div'));
    }

    for (let i = 1; i <= lastDate; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const cell = document.createElement('div');
        
        // standardDate와 정확히 일치하는지 확인
        const hasData = contentsData.some(item => item.standardDate === dateStr);
        const isToday = new Date().toISOString().slice(0, 10) === dateStr;
        const isSelected = selectedDate === dateStr;

        cell.className = `aspect-square flex flex-col items-center justify-center rounded-lg cursor-pointer transition duration-200 border border-transparent hover:bg-gray-800 relative
            ${isSelected ? 'bg-gray-800 border-red-600 text-white' : 'text-gray-400'}
            ${isToday ? 'bg-gray-800/50' : ''}
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

function renderCollections() {
    if (currentMainTab === 'scheduler') return;

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
    if (currentMainTab === 'scheduler') return;
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
    contentList.innerHTML = '';
    let result = contentsData;

    // 필터링
    if (currentMainTab === 'scheduler') {
        if (selectedDate) {
            // 표준 날짜(YYYY-MM-DD)와 정확히 일치하는지 비교
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

    // 검색
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

    // 결과 없음 (멘트 수정됨)
    if (result.length === 0) {
        if (contentsData.length > 0) {
            if (currentMainTab === 'scheduler' && selectedDate) {
                // ⚡ [수정] 멘트 변경
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

// 이벤트 핸들러
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

    // 캘린더 이동
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

    document.getElementById('more-info-button').onclick = () => alert("오류 및 문의사항은 @Penta_1031 로 제보 부탁드립니다.");
    
    loadMoreButton.onclick = () => { currentPage++; renderContent(); };
}

function applySiteConfig(config) {
    if (!config) return;
    if (config.hero_title) document.getElementById('hero-title').innerText = config.hero_title;
    if (config.hero_subtitle) document.getElementById('hero-subtitle').innerText = config.hero_subtitle;
    if (config.hero_desc) document.getElementById('hero-desc').innerText = config.hero_desc;
    if (config.hero_bg) heroSection.style.backgroundImage = `url('${config.hero_bg}')`;
}

document.addEventListener('DOMContentLoaded', initApp);