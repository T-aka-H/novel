let currentStep = 1;
let storyData = {};
let currentPage = 0;
let totalPages = 1;
let storyPages = [];

// ステップインジケーター更新
function updateStepIndicator(step) {
    document.querySelectorAll('.step').forEach((el, index) => {
        el.classList.remove('active', 'completed');
        if (index + 1 < step) {
            el.classList.add('completed');
        } else if (index + 1 === step) {
            el.classList.add('active');
        }
    });
}

// ローディング表示
function showLoading() {
    document.getElementById('loading').classList.add('show');
}

function hideLoading() {
    document.getElementById('loading').classList.remove('show');
}

// エラー表示
function showError(message) {
    const errorDiv = document.getElementById('error-display');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

// テキストをページに分割（縦書き用に調整）
function splitTextIntoPages(text, charsPerPage = 550) {
    const pages = [];
    let currentPageText = '';
    let charCount = 0;
    
    // 文章を文単位で分割
    const sentences = text.split(/([。！？])/);
    let tempSentence = '';
    
    for (let i = 0; i < sentences.length; i += 2) {
        if (i + 1 < sentences.length) {
            tempSentence = sentences[i] + sentences[i + 1];
        } else {
            tempSentence = sentences[i];
        }
        
        if (charCount + tempSentence.length > charsPerPage && currentPageText.length > 0) {
            pages.push(currentPageText);
            currentPageText = tempSentence;
            charCount = tempSentence.length;
        } else {
            currentPageText += tempSentence;
            charCount += tempSentence.length;
        }
    }
    
    if (currentPageText.trim()) {
        pages.push(currentPageText);
    }
    
    return pages;
}

// ページ表示
function displayPages(pages, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    
    pages.forEach((pageText, index) => {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'story-page';
        pageDiv.textContent = pageText;
        if (index === 0) {
            pageDiv.classList.add('active');
        }
        container.appendChild(pageDiv);
    });
    
    storyPages = pages;
    totalPages = pages.length;
    currentPage = 0;
    updatePageIndicator();
    updatePageButtons();
}

// 次のページ（縦書きなので右から左へ）
function nextPage() {
    if (currentPage < totalPages - 1) {
        const currentPageEl = document.querySelectorAll('.story-page')[currentPage];
        const nextPageEl = document.querySelectorAll('.story-page')[currentPage + 1];
        
        // 現在のページを左に移動
        currentPageEl.classList.remove('active');
        currentPageEl.classList.add('prev');
        
        setTimeout(() => {
            // 次のページを右から表示
            nextPageEl.classList.add('active');
            currentPage++;
            updatePageIndicator();
            updatePageButtons();
        }, 100);
        
        setTimeout(() => {
            currentPageEl.classList.remove('prev');
        }, 600);
    }
}

// 前のページ（縦書きなので左から右へ）
function prevPage() {
    if (currentPage > 0) {
        const currentPageEl = document.querySelectorAll('.story-page')[currentPage];
        const prevPageEl = document.querySelectorAll('.story-page')[currentPage - 1];
        
        // 現在のページを右に移動
        currentPageEl.classList.remove('active');
        
        setTimeout(() => {
            // 前のページを左から表示
            prevPageEl.classList.remove('prev');
            prevPageEl.classList.add('active');
            currentPage--;
            updatePageIndicator();
            updatePageButtons();
        }, 100);
        
        setTimeout(() => {
            // 現在のページを右側に配置
            currentPageEl.style.transform = 'translateX(100%)';
            setTimeout(() => {
                currentPageEl.style.transform = '';
            }, 50);
        }, 600);
    }
}

// ページインジケーター更新
function updatePageIndicator() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
        indicator.textContent = `${currentPage + 1} / ${totalPages}`;
    }
}

// ページボタン状態更新
function updatePageButtons() {
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    if (prevBtn) prevBtn.disabled = currentPage === 0;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages - 1;
}

// プロローグ生成
async function generateProlog() {
    const character1 = document.getElementById('character1').value.trim();
    const character2 = document.getElementById('character2').value.trim();
    const character3 = document.getElementById('character3').value.trim();
    const setting = document.getElementById('setting').value.trim();
    const genre = document.getElementById('genre').value;

    if (!character1 || !character2 || !character3 || !setting || !genre) {
        showError('すべての項目を入力してください。');
        return;
    }

    storyData = {
        characters: [character1, character2, character3],
        setting,
        genre
    };

    showLoading();

    try {
        const response = await fetch('/api/generate-prolog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storyData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'プロローグの生成に失敗しました');
        }

        const result = await response.json();
        document.getElementById('prolog-content').textContent = result.prolog;
        
        // UI更新
        document.getElementById('input-form').style.display = 'none';
        document.getElementById('prolog-section').classList.add('show');
        currentStep = 2;
        updateStepIndicator(currentStep);
        
    } catch (error) {
        console.error('プロローグ生成エラー:', error);
        showError(error.message || 'プロローグの生成中にエラーが発生しました。もう一度お試しください。');
    } finally {
        hideLoading();
    }
}

// 完成版小説生成
async function generateFullStory() {
    const feedback = document.getElementById('feedback').value.trim();
    storyData.feedback = feedback;

    showLoading();

    try {
        const response = await fetch('/api/generate-story', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(storyData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '小説の生成に失敗しました');
        }

        const result = await response.json();
        
        // テキストをページに分割
        const pages = splitTextIntoPages(result.story);
        displayPages(pages, 'story-pages');
        
        // UI更新
        document.getElementById('prolog-section').style.display = 'none';
        document.getElementById('full-story-section').classList.add('show');
        currentStep = 3;
        updateStepIndicator(currentStep);
        
    } catch (error) {
        console.error('完成版小説生成エラー:', error);
        showError(error.message || '小説の生成中にエラーが発生しました。もう一度お試しください。');
    } finally {
        hideLoading();
    }
}

// アプリリセット
function resetApp() {
    currentStep = 1;
    storyData = {};
    currentPage = 0;
    totalPages = 1;
    storyPages = [];
    
    // フォームクリア
    ['character1', 'character2', 'character3', 'setting', 'genre', 'feedback'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.value = '';
        }
    });
    
    // UI状態リセット
    document.getElementById('input-form').style.display = 'block';
    document.getElementById('prolog-section').classList.remove('show');
    document.getElementById('full-story-section').classList.remove('show');
    document.getElementById('error-display').style.display = 'none';
    updateStepIndicator(currentStep);
}

// キーボードショートカット
document.addEventListener('keydown', (event) => {
    // 小説表示時のキーボード操作
    if (currentStep === 3) {
        if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
            event.preventDefault();
            nextPage(); // 縦書きでは左キーで次ページ
        } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
            event.preventDefault();
            prevPage(); // 縦書きでは右キーで前ページ
        }
    }
    
    // ESCキーでエラーメッセージを閉じる
    if (event.key === 'Escape') {
        const errorDiv = document.getElementById('error-display');
        if (errorDiv.style.display === 'block') {
            errorDiv.style.display = 'none';
        }
    }
});

// タッチ/マウスでのページめくり
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (event) => {
    if (currentStep === 3) {
        touchStartX = event.changedTouches[0].screenX;
    }
}, { passive: true });

document.addEventListener('touchend', (event) => {
    if (currentStep === 3) {
        touchEndX = event.changedTouches[0].screenX;
        handleSwipe();
    }
}, { passive: true });

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // 左にスワイプ = 次ページ（縦書き）
            nextPage();
        } else {
            // 右にスワイプ = 前ページ（縦書き）
            prevPage();
        }
    }
}

// ページ読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', () => {
    console.log('村Gemini春樹 - アプリケーション初期化完了');
    updateStepIndicator(currentStep);
    
    // フォーカス管理
    const firstInput = document.getElementById('character1');
    if (firstInput) {
        firstInput.focus();
    }
});

// ウィンドウリサイズ時の処理
window.addEventListener('resize', () => {
    // ページ表示の調整が必要な場合
    if (currentStep === 3 && storyPages.length > 0) {
        // 現在のページ情報を保持してページを再構築
        const currentPageContent = storyPages[currentPage];
        const allContent = storyPages.join('');
        const newPages = splitTextIntoPages(allContent);
        
        // 現在のページ位置を調整
        let newCurrentPage = 0;
        let accumulatedContent = '';
        for (let i = 0; i < newPages.length; i++) {
            accumulatedContent += newPages[i];
            if (accumulatedContent.includes(currentPageContent.substring(0, 50))) {
                newCurrentPage = i;
                break;
            }
        }
        
        displayPages(newPages, 'story-pages');
        currentPage = newCurrentPage;
        updatePageIndicator();
        updatePageButtons();
        
        // アクティブページを設定
        document.querySelectorAll('.story-page').forEach((page, index) => {
            page.classList.toggle('active', index === currentPage);
        });
    }
});

// エラーハンドリング
window.addEventListener('error', (event) => {
    console.error('JavaScript エラー:', event.error);
    showError('アプリケーションエラーが発生しました。ページを再読み込みしてください。');
});

// 未処理のPromise拒否をキャッチ
window.addEventListener('unhandledrejection', (event) => {
    console.error('未処理の Promise 拒否:', event.reason);
    showError('通信エラーが発生しました。ネットワーク接続を確認してください。');
});