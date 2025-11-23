// ============================================================================
// ⚙️ 설정 영역: 본인의 웹 앱 URL과 비밀번호를 확인하세요.
// ============================================================================
const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbx0JfRUmY39YAVaRhajoX21zQ4ld1S3XYJMd-8-u6oUhG7QTisbl5hGmgCrPZZuIVsx/exec';
const ADMIN_PASSWORD = '1234';

// ============================================================================
// 📌 1. 데이터 분류 규칙 정의
//    (I열에 적힌 키워드를 보고 -> 어떤 모음집인지 역으로 찾아냅니다)
// ============================================================================
const CATEGORY_GROUPS = {
    '무대 모음집': ['콘서트', '해투', '페스티벌', '버스킹', '음방', '커버', '쇼케이스', '퇴근길', '뮤비', '무대', '직캠'],
    '라이브 모음집': ['우얘합', '하루의마무리', '단체라이브', '개인라이브', '라이브'],
    '투샷 모음집': ['인스타그램', '릴스', '셀카', '투샷', '사진'],
    '메시지 모음집': ['프롬혚쾌', '혚쾌버블', '버블', '메시지'],
    '미디어 모음집': ['팬싸', '인터뷰', '자체컨텐츠', '방송', '공식컨텐츠', '자컨', '예능']
};

// 역방향 조회를 위한 맵 생성 (예: '콘서트' -> '무대 모음집')
const REVERSE_LOOKUP = {};
for (const [collection, items] of Object.entries(CATEGORY_GROUPS)) {
    items.forEach(item => REVERSE_LOOKUP[item] = collection);
}

// ============================================================================
// 📌 2. 탭 매핑 규칙 (모음집 이름 -> 메인 탭)
// ============================================================================
const TAB_MAPPING = {
    // [혚쾌러 필독 콘텐츠]
    '입덕가이드': 'must-read', '연말결산': 'must-read', '필독': 'must-read',
    
    // [뉴비 시청 권장 리스트]
    '질투': 'newbie', '친지마': 'newbie', '모음집': 'newbie', '혚쾌 키워드': 'newbie', '뉴비': 'newbie',

    // [혚쾌의 모든 것들]
    '무대 모음집': 'archive', '라이브 모음집': 'archive', '투샷 모음집': 'archive', 
    '메시지 모음집': 'archive', '미디어 모음집': 'archive'
};

// ============================================================================
// 📌 3. 화면 표시 순서 고정 (데이터 유무와 상관없이 이 순서로 버튼 노출)
// ============================================================================
const NEWBIE_COLLECTIONS = ['질투', '친지마', '모음집'];
const ARCHIVE_COLLECTIONS = ['무대 모음집', '라이브 모음집', '투샷 모음집', '메시지 모음집', '미디어 모음집'];


// ============================================================================
// 🚀 전역 변수 및 DOM 요소
// ============================================================================
let contentsData = [];
let currentMainTab = 'must-read'; 
let currentCollection = 'All';    
let selectedCategories = new Set(); 
let currentPage = 1;
const ITEMS_PER_PAGE = 24;
let isAdminMode = false;

const mainAppArea = document.getElementById('main-app-area');
const contentList = document.getElementById('content-list');
const loadMoreButton = document.getElementById('load-more-button');
const loadMoreContainer = document.getElementById('load-more-container');
const subCategoryList = document.getElementById('sub-category-list'); 
const keywordFilterSection = document.getElementById('keyword-filter-section'); 
const noResultsMsg = document.getElementById('no-results');
const heroSection = document.getElementById('hero-section');

// ============================================================================
// 🚀 앱 초기화 및 데이터 로드
// ============================================================================
async function initApp() {
    console.log("App Start...");
    setupEventListeners(); // 버튼 이벤트 먼저 연결

    // 백그라운드 데이터 로드
    const rawData = await fetchGoogleSheetData();
    if (rawData) {
        contentsData = processRawData(rawData.data);
        // 날짜 기준 내림차순 (최신순)
        contentsData.sort((a, b) => new Date(b.date) - new Date(a.date)); 
        applySiteConfig(rawData.config);
        
        // 데이터 준비 완료 후 UI 갱신
        renderMainTabs();
        refreshView();
    }
}

// 데이터 가공 함수 (I열 -> 모음집 자동 분류)
function processRawData(data) {
    return data.map(item => {
        // 제목이 없으면 스킵
        const title = (item['제목'] || item['title'] || '').trim();
        if (!title) return null;

        const link = (item['링크'] || item['link'] || '').trim(); // C열
        const rawDate = item['날짜'] || item['date'] || '';
        const thumb = item['썸네일'] || item['thumbnail'] || '';
        
        // I열: 카테고리 (Category) 읽기
        const rawCategoryStr = (item['카테고리'] || item['category'] || '').trim();
        const categoryList = rawCategoryStr.split(',').map(k => k.trim()).filter(k => k !== '');

        // 1. 모음집(Collection) 이름 추론
        let collectionName = '기타';
        if (categoryList.length > 0) {
            const firstCat = categoryList[0];
            
            // 뉴비/필독 관련 키워드 우선 체크
            if (['질투', '친지마', '모음집', '뉴비'].includes(firstCat)) collectionName = firstCat;
            else if (['입덕가이드', '연말결산', '필독'].includes(firstCat)) collectionName = firstCat;
            else {
                // 그 외에는 역방향 조회 (콘서트 -> 무대 모음집)
                collectionName = REVERSE_LOOKUP[firstCat] || '기타';
            }
        }

        // 2. 메인 탭(MainTab) 결정
        let targetTab = TAB_MAPPING[collectionName] || 'archive';

        return {
            title, link, date: rawDate,
            mainTab: targetTab,
            collection: collectionName,
            categoryList: categoryList,
            thumbnail: thumb
        };
    }).filter(item => item !== null); // 빈 데이터 제거
}

async function fetchGoogleSheetData() {
    try {
        const response = await fetch(GOOGLE_SHEET_API_URL);
        return await response.json();
    } catch (error) { return null; }
}

// 화면 갱신 통합 함수
function refreshView() {
    renderCollections(); 
    renderCategories();  
    renderContent();     
}

// ============================================================================
// 🎨 UI 렌더링 함수들
// ============================================================================

// 1. 메인 탭 렌더링
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

// 2. 모음집 버튼 렌더링
function renderCollections() {
    subCategoryList.innerHTML = '';
    let listToShow = ['All'];

    // 탭별로 보여줄 버튼 리스트 결정
    if (currentMainTab === 'archive') {
        listToShow = ['All', ...ARCHIVE_COLLECTIONS];
    } else if (currentMainTab === 'newbie') {
        listToShow = ['All', ...NEWBIE_COLLECTIONS];
    } else {
        // 그 외 탭은 데이터 있는 것만 동적 생성
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

// 3. 카테고리 필터 렌더링
function renderCategories() {
    keywordFilterSection.innerHTML = '';

    // 현재 선택된 범위의 데이터에서 카테고리 추출
    let filteredData = contentsData.filter(item => item.mainTab === currentMainTab);
    if (currentCollection !== 'All') {
        filteredData = filteredData.filter(item => item.collection === currentCollection);
    }
    
    const availableCats = new Set();
    filteredData.forEach(item => item.categoryList.forEach(c => availableCats.add(c)));

    // 순서 결정: 정의된 그룹 순서 우선, 나머지는 뒤에 가나다순
    let displayList = [];
    if (CATEGORY_GROUPS[currentCollection]) {
        displayList = CATEGORY_GROUPS[currentCollection].filter(c => availableCats.has(c));
        const extras = Array.from(availableCats).filter(c => !CATEGORY_GROUPS[currentCollection].includes(c));
        displayList = [...displayList, ...extras.sort()];
    } else {
        displayList = Array.from(availableCats).sort();
    }

    // 표시할 카테고리가 없으면 숨김
    if (displayList.length === 0) {
        keywordFilterSection.classList.add('hidden');
        return;
    }
    keywordFilterSection.classList.remove('hidden');
    
    // 라벨
    const label = document.createElement('span');
    label.className = "text-gray-500 text-sm flex items-center mr-2";
    label.innerHTML = `<i class="fas fa-filter mr-1"></i> 카테고리:`;
    keywordFilterSection.appendChild(label);

    // 버튼 생성
    displayList.forEach(cat => {
        const btn = document.createElement('button');
        const isSelected = selectedCategories.has(cat);
        
        btn.className = `text-xs md:text-sm px-3 py-1 rounded-full border transition duration-200 mb-1 ${
            isSelected 
            ? 'bg-red-600 border-red-600 text-white' 
            : 'bg-transparent border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white'
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

// 4. 컨텐츠 카드 렌더링 (컴팩트 디자인 적용)
function renderContent() {
    contentList.innerHTML = '';
    
    let result = contentsData.filter(item => item.mainTab === currentMainTab);
    if (currentCollection !== 'All') {
        result = result.filter(item => item.collection === currentCollection);
    }
    if (selectedCategories.size > 0) {
        result = result.filter(item => item.categoryList.some(c => selectedCategories.has(c)));
    }

    if (result.length === 0) {
        if (contentsData.length > 0) noResultsMsg.classList.remove('hidden');
        loadMoreContainer.classList.add('hidden');
        return;
    }
    noResultsMsg.classList.add('hidden');

    const endIndex = currentPage * ITEMS_PER_PAGE;
    result.slice(0, endIndex).forEach(item => {
        const card = document.createElement('div');
        // 컴팩트 스타일 카드 디자인
        card.className = "group bg-[#181818] rounded-md overflow-hidden cursor-pointer relative transition duration-300 hover:z-10 hover:scale-105 hover:shadow-xl";
        card.onclick = () => window.open(item.link, '_blank');

        // 썸네일 16:9 비율
        let thumbnailHtml = `<div class="aspect-video bg-gray-800 flex items-center justify-center"><i class="fas fa-play text-2xl text-gray-600"></i></div>`;
        if (item.thumbnail) {
            thumbnailHtml = `<div class="aspect-video overflow-hidden"><img src="${item.thumbnail}" class="w-full h-full object-cover transition duration-500 group-hover:brightness-110" alt="${item.title}"></div>`;
        }

        card.innerHTML = `
            ${thumbnailHtml}
            <div class="p-2">
                <div class="flex items-center justify-between mb-1">
                    <span class="text-[9px] font-bold text-red-500 border border-red-500 px-1 rounded tracking-tight truncate max-w-[70px]">${item.collection}</span>
                    <span class="text-[9px] text-gray-500">${item.date ? item.date.split('T')[0] : ''}</span>
                </div>
                <h3 class="text-xs md:text-sm font-bold text-gray-200 leading-tight line-clamp-2 group-hover:text-white">${item.title}</h3>
            </div>
        `;
        contentList.appendChild(card);
    });
    
    if (endIndex >= result.length) loadMoreContainer.classList.add('hidden');
    else loadMoreContainer.classList.remove('hidden');
}

// ============================================================================
// ⚡ 이벤트 핸들러 및 기타 기능
// ============================================================================

function setupEventListeners() {
    // 1. 시청하기 버튼 (랜딩 페이지 -> 메인 앱 전환)
    const watchBtn = document.getElementById('watch-button');
    if(watchBtn) {
        watchBtn.onclick = () => {
            mainAppArea.classList.remove('hidden');
            setTimeout(() => {
                mainAppArea.classList.remove('opacity-0');
                mainAppArea.scrollIntoView({ behavior: 'smooth' });
            }, 100);
            
            // 초기화
            currentMainTab = 'must-read';
            currentCollection = 'All';
            renderMainTabs();
            refreshView();
        };
    }

    // 2. 상세 정보 버튼
    const infoBtn = document.getElementById('more-info-button');
    if(infoBtn) {
        infoBtn.onclick = () => {
            alert("오류 및 문의사항은 @Penta_1031 로 제보 부탁드립니다.");
        };
    }

    // 3. 관리자 모드 진입
    document.getElementById('admin-login').onclick = () => {
        if (prompt("관리자 비밀번호:") === ADMIN_PASSWORD) {
            isAdminMode = true;
            document.getElementById('edit-bg-btn').classList.remove('hidden');
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
            alert("관리자 모드 활성화");
        }
    };

    // 4. 배경 수정 (관리자)
    document.getElementById('edit-bg-btn').onclick = async () => {
        const newUrl = prompt("새 배경 URL:", heroSection.style.backgroundImage.slice(5, -2));
        if (newUrl) await sendUpdate('update_config', { key: 'hero_bg', value: newUrl });
    };
    
    // 5. 더 보기 버튼
    loadMoreButton.onclick = () => { currentPage++; renderContent(); };
}

// Config 적용 (배경, 제목 등)
function applySiteConfig(config) {
    if (!config) return;
    if (config.hero_title) document.getElementById('hero-title').innerText = config.hero_title;
    if (config.hero_subtitle) document.getElementById('hero-subtitle').innerText = config.hero_subtitle;
    if (config.hero_desc) document.getElementById('hero-desc').innerText = config.hero_desc;
    if (config.hero_bg) heroSection.style.backgroundImage = `url('${config.hero_bg}')`;
}

// Apps Script로 데이터 전송
async function sendUpdate(action, payload) {
    await fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
    });
    location.reload();
}

// 텍스트 수정 (관리자)
window.editConfig = async function(key) { 
    if (!isAdminMode) return; 
    let currentVal = document.getElementById(key.replace('_', '-')).innerText;
    const newVal = prompt("수정할 내용:", currentVal);
    if (newVal && newVal !== currentVal) {
        await sendUpdate('update_config', { key, value: newVal });
    }
};

document.addEventListener('DOMContentLoaded', initApp);