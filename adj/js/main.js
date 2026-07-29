var currentLang = 'ja';
var mistakeRecordList = [];
var mistakeQuestionPool = [];
var practiceMistakeMode = false;
var baseMode = null;
var sortMain = null;
var subOpt = null;
var score = 0;
var attemptCount = 0;
var correctCount = 0;
var wrongCount = 0;
var currentQ = null;
var timerId = null;
var remainTime = 20;
var fullFilterPool = [];
var hasTokuiAppeared = false;
var questionResultShown = false;
var answerPhase = false; // true = answered, action-btn = continue

// ====== Screen Transition Utility ======
function switchScreen(incoming, duration) {
    duration = duration || 350;
    var current = document.querySelector('.screen.active');
    if (current === incoming) return;
    // Activate incoming first so flex container always has a relative child
    incoming.classList.remove('exiting');
    void incoming.offsetWidth;
    incoming.classList.add('active');
    // Then deactivate current
    if (current) {
        current.classList.add('exiting');
        current.classList.remove('active');
        setTimeout(function() {
            current.classList.remove('exiting');
        }, duration);
    }
}

function animateScorePop() {
    var scoreEl = document.getElementById('score-num');
    scoreEl.classList.add('pop');
    setTimeout(function() {
        scoreEl.classList.remove('pop');
    }, 180);
}

function removeSolvedMistake(enText) {
    mistakeRecordList = mistakeRecordList.filter(function(item) {
        return item.questionText !== enText;
    });
}

function renderLang() {
    var dict = langData[currentLang];
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
        var key = el.getAttribute('data-i18n');
        if (key === 'checkBtn' && answerPhase) {
            el.innerText = dict['continueBtn'];
        } else {
            el.innerText = dict[key];
        }
    });
    if (currentQ) {
        if (currentLang === 'ja') {
            document.getElementById('question-area').innerText = '意味：' + currentQ.en;
        } else {
            document.getElementById('question-area').innerText = 'Meaning: ' + currentQ.en;
        }
        refreshTimerText();
        if (questionResultShown) {
            refreshFeedbackText();
        }
    }
    document.getElementById('lang-switch').classList.toggle('en', currentLang === 'en');
    document.getElementById('lang-ja').classList.toggle('active', currentLang === 'ja');
    document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');
}

function refreshTimerText() {
    if (baseMode === 'challenge') {
        var dict = langData[currentLang];
        document.getElementById('timer-area').innerText = dict.timerLabel + remainTime + 's';
    }
}

function refreshFeedbackText() {
    var feedArea = document.getElementById('feed-area');
    var dict = langData[currentLang];
    if (feedArea.classList.contains('correct-text')) {
        feedArea.innerHTML = '<div class="feed-line1">' + dict.correctTitle + '</div><div class="feed-line2">+10' + (currentLang === 'ja' ? '点' : 'pts') + '</div>';
    } else {
        feedArea.innerHTML = '<div class="feed-line1">' + dict.wrongTitle + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.jp + '</div>';
    }
}

function shuffleArray(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
    }
    return copy;
}

function getFilteredFullPool() {
    if (practiceMistakeMode) {
        return shuffleArray(mistakeQuestionPool.slice());
    }
    var list = fullBank.slice();
    if (sortMain === 'lesson') {
        var sNum = parseInt(subOpt.replace('stage', ''));
        list = list.filter(function(item) { return item.stage === sNum; });
    } else if (sortMain === 'grammar') {
        list = list.filter(function(item) { return item.type === subOpt; });
    } else if (sortMain === 'diff') {
        if (subOpt === 'easy') {
            list = list.filter(function(item) { return item.diff === 'easy'; });
        }
    }
    if (!hasTokuiAppeared) {
        var tokuiItems = list.filter(function(x) { return x.base === 'とくい'; });
        var otherItems = list.filter(function(x) { return x.base !== 'にがて'; });
        list = tokuiItems.concat(shuffleArray(otherItems));
    }
    return shuffleArray(list);
}

function pickNextQuestion() {
    if (fullFilterPool.length <= 0) {
        fullFilterPool = getFilteredFullPool();
    }
    var q = fullFilterPool.shift();
    if (q.base === 'とくい') hasTokuiAppeared = true;
    return q;
}

function resetActionRow() {
    answerPhase = false;
    var row = document.getElementById('action-row');
    row.classList.remove('answered');
    var actionBtn = document.getElementById('action-btn');
    actionBtn.classList.remove('wrong');
    actionBtn.innerText = langData[currentLang]['checkBtn'];
}

function loadNewQuestion() {
    clearInterval(timerId);
    resetActionRow();
    currentQ = pickNextQuestion();
    questionResultShown = false;
    if (currentLang === 'ja') {
        document.getElementById('question-area').innerText = '意味：' + currentQ.en;
    } else {
        document.getElementById('question-area').innerText = 'Meaning: ' + currentQ.en;
    }
    document.getElementById('ans-input').value = '';
    document.getElementById('ans-input').readOnly = false;
    var feedArea = document.getElementById('feed-area');
    feedArea.innerText = langData[currentLang]['inputTip'];
    feedArea.className = '';
    document.getElementById('note-area').innerText = '';
    document.getElementById('note-area').className = 'note-text';

    if (baseMode === 'challenge') {
        remainTime = 20;
        startTimer();
    } else {
        document.getElementById('timer-area').innerText = '';
    }
    document.getElementById('ans-input').focus();
}

function startTimer() {
    clearInterval(timerId);
    refreshTimerText();
    timerId = setInterval(function() {
        remainTime--;
        refreshTimerText();
        if (remainTime <= 0) {
            clearInterval(timerId);
            finishAnswer(true);
        }
    }, 1000);
}

function enterAnsweredState(isCorrect) {
    answerPhase = true;
    var row = document.getElementById('action-row');
    row.classList.add('answered');
    var actionBtn = document.getElementById('action-btn');
    actionBtn.innerText = langData[currentLang]['continueBtn'];
    if (!isCorrect) {
        actionBtn.classList.add('wrong');
    }
}

function finishAnswer(isTimeout) {
    isTimeout = isTimeout || false;
    var dict = langData[currentLang];

    document.getElementById('ans-input').readOnly = true;

    enterAnsweredState(false);

    var feedArea2 = document.getElementById('feed-area');
    feedArea2.className = 'wrong-text';
    var title = isTimeout ? dict.timeOverTitle : dict.wrongTitle;
    feedArea2.innerHTML = '<div class="feed-line1">' + title + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.jp + '</div>';
    questionResultShown = true;

    if (!practiceMistakeMode) {
        var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
        if (!alreadyExist) {
            wrongCount++;
            attemptCount++;
            mistakeRecordList.push({
                en: currentQ.en,
                questionText: currentQ.en,
                correctAns: currentQ.jp,
                userAns: document.getElementById('ans-input').value.trim()
            });
        }
    }

    if (currentQ.needNote) {
        var noteDom = document.getElementById('note-area');
        noteDom.innerText = dict.noteTokui;
        noteDom.className = 'note-text visible';
    }
}

// ====== Event Bindings ======
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('lang-ja').onclick = function() { currentLang = 'ja'; renderLang(); };
    document.getElementById('lang-en').onclick = function() { currentLang = 'en'; renderLang(); };

    document.querySelectorAll('.base-mode').forEach(function(btn) {
        btn.onclick = function() {
            document.querySelectorAll('.base-mode').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            baseMode = btn.dataset.val;
            // Show step2
            document.getElementById('step2-section').classList.add('visible');
            updateStartBtnState();
        };
    });

    document.querySelectorAll('.sort-type').forEach(function(btn) {
        btn.onclick = function() {
            document.querySelectorAll('.sort-type').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            sortMain = btn.dataset.val;
            // Show step3
            document.getElementById('step3-section').classList.add('visible');
            document.querySelectorAll('.opt-panel').forEach(function(p) { p.classList.remove('active'); });
            if (sortMain === 'lesson') { document.querySelector('.opt-lesson').classList.add('active'); }
            else if (sortMain === 'grammar') { document.querySelector('.opt-grammar').classList.add('active'); }
            else if (sortMain === 'diff') { document.querySelector('.opt-diff').classList.add('active'); }
            subOpt = null;
            document.querySelectorAll('.opt-item').forEach(function(o) { o.classList.remove('active'); });
            updateStartBtnState();
        };
    });

    document.querySelectorAll('.opt-item').forEach(function(btn) {
        btn.onclick = function() {
            var parent = btn.parentElement;
            parent.querySelectorAll('.opt-item').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            subOpt = btn.dataset.val;
            updateStartBtnState();
        };
    });

    document.getElementById('start-quiz').onclick = function() {
        if (!baseMode || !sortMain || !subOpt) {
            var dict2 = langData[currentLang];
            alert(currentLang === 'ja'
                ? 'モード・区分・オプションをすべて選択してください'
                : 'Please select mode, category and detail options first');
            return;
        }
        switchScreen(document.getElementById('quiz-page'));
        score = 0; attemptCount = 0; correctCount = 0; wrongCount = 0;
        mistakeRecordList = [];
        mistakeQuestionPool = [];
        practiceMistakeMode = false;
        fullFilterPool = [];
        hasTokuiAppeared = false;
        questionResultShown = false;
        document.getElementById('score-num').innerText = score;
        loadNewQuestion();
    };

    // Unified action button
    document.getElementById('action-btn').onclick = function() {
        if (answerPhase) {
            // Continue mode
            loadNewQuestion();
        } else {
            // Check mode
            var userInput = document.getElementById('ans-input').value.trim();
            if (userInput === '') return;
            clearInterval(timerId);
            var noteDom = document.getElementById('note-area');
            noteDom.innerText = '';
            if (!practiceMistakeMode) attemptCount++;
            if (userInput === currentQ.jp) {
                score += 10;
                document.getElementById('score-num').innerText = score;
                animateScorePop();
                enterAnsweredState(true);
                document.getElementById('ans-input').readOnly = true;
                var feedArea3 = document.getElementById('feed-area');
                feedArea3.className = 'correct-text';
                var dict3 = langData[currentLang];
                feedArea3.innerHTML = '<div class="feed-line1">' + dict3.correctTitle + '</div><div class="feed-line2">+10' + (currentLang === 'ja' ? '点' : 'pts') + '</div>';
                questionResultShown = true;
                if (practiceMistakeMode) {
                    mistakeQuestionPool = mistakeQuestionPool.filter(function(item) { return item.en !== currentQ.en; });
                    removeSolvedMistake(currentQ.en);
                }
            } else {
                if (!practiceMistakeMode) {
                    var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
                    if (!alreadyExist) {
                        mistakeRecordList.push({ en: currentQ.en, questionText: currentQ.en, correctAns: currentQ.jp, userAns: userInput });
                    }
                }
                finishAnswer(false);
            }
        }
    };

    document.getElementById('skip-btn').onclick = function() {
        if (answerPhase) return;
        clearInterval(timerId);
        var userInput = document.getElementById('ans-input').value.trim();
        if (!practiceMistakeMode) {
            var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
            if (!alreadyExist) {
                mistakeRecordList.push({ en: currentQ.en, questionText: currentQ.en, correctAns: currentQ.jp, userAns: userInput || '(SKIP)' });
            }
        }
        finishAnswer(false);
    };

    document.getElementById('practiceMistakeBtn').onclick = function() {
        if (mistakeRecordList.length === 0) {
            alert(currentLang === 'ja' ? 'ミスした問題はありません' : 'No mistakes in this session');
            return;
        }
        practiceMistakeMode = true;
        switchScreen(document.getElementById('quiz-page'));
        mistakeQuestionPool = mistakeRecordList.map(function(item) { return { en: item.en, jp: item.correctAns }; });
        fullFilterPool = shuffleArray(mistakeQuestionPool.slice());
        loadNewQuestion();
    };

    // IME-aware Enter key
    var ansInput = document.getElementById('ans-input');
    var isComposing = false;
    ansInput.addEventListener('compositionstart', function() { isComposing = true; });
    ansInput.addEventListener('compositionend', function() { setTimeout(function() { isComposing = false; }, 0); });
    ansInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.isComposing || isComposing || e.keyCode === 229) return;
            document.getElementById('action-btn').click();
        }
    });

    updateStartBtnState();
    renderLang();
});

function updateStartBtnState() {
    var ready = !!(baseMode && sortMain && subOpt);
    document.getElementById('start-quiz').disabled = !ready;
}

function backToHome() {
    clearInterval(timerId);
    switchScreen(document.getElementById('home'));

    var prevBaseMode = baseMode;
    var prevSortMain = sortMain;
    var prevSubOpt = subOpt;

    // Restore step visibility
    if (prevBaseMode) { document.getElementById('step2-section').classList.add('visible'); }
    if (prevSortMain) { document.getElementById('step3-section').classList.add('visible'); }

    document.querySelectorAll('.mode-btn').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.opt-panel').forEach(function(p) { p.classList.remove('active'); });

    // Re-highlight previously selected buttons and restore opt-panel
    if (prevBaseMode) {
        var baseBtn = document.querySelector('.base-mode[data-val="' + prevBaseMode + '"]');
        if (baseBtn) baseBtn.classList.add('active');
    }
    if (prevSortMain) {
        var sortBtn = document.querySelector('.sort-type[data-val="' + prevSortMain + '"]');
        if (sortBtn) sortBtn.classList.add('active');
        // Re-show the matching opt-panel
        if (prevSortMain === 'lesson') { document.querySelector('.opt-lesson').classList.add('active'); }
        else if (prevSortMain === 'grammar') { document.querySelector('.opt-grammar').classList.add('active'); }
        else if (prevSortMain === 'diff') { document.querySelector('.opt-diff').classList.add('active'); }
    }
    if (prevSubOpt) {
        var optBtn = document.querySelector('.opt-item[data-val="' + prevSubOpt + '"]');
        if (optBtn) optBtn.classList.add('active');
    }

    baseMode = prevBaseMode; sortMain = prevSortMain; subOpt = prevSubOpt;
    updateStartBtnState();
    fullFilterPool = [];
    score = 0; attemptCount = 0; correctCount = 0; wrongCount = 0;
    hasTokuiAppeared = false;
    mistakeRecordList = [];
    mistakeQuestionPool = [];
    practiceMistakeMode = false;
    questionResultShown = false;
}

function showSummary() {
    clearInterval(timerId);
    switchScreen(document.getElementById('summary-page'));
    document.getElementById('sumAttemptNum').innerText = attemptCount;
    document.getElementById('sumCorrectNum').innerText = correctCount;
    document.getElementById('sumWrongNum').innerText = wrongCount;
    document.getElementById('sumScoreNum').innerText = score;
    var tbody = document.getElementById('mistakeTableBody');
    tbody.innerHTML = '';
    mistakeRecordList.forEach(function(item, idx) {
        var tr = document.createElement('tr');
        tr.innerHTML =
            '<td>' + (idx + 1) + '</td>' +
            '<td>' + item.en + '</td>' +
            '<td>' + item.questionText + '</td>' +
            '<td>' + item.correctAns + '</td>' +
            '<td>' + item.userAns + '</td>';
        tbody.appendChild(tr);
    });
}