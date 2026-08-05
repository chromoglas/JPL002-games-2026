var currentLang = 'en';
var mistakeRecordList = [];
var mistakeQuestionPool = [];
var practiceMistakeMode = false;
var baseMode = null;
var subOpt = null;
var score = 0;
var attemptCount = 0;
var correctCount = 0;
var wrongCount = 0;
var currentQ = null;
var timerId = null;
var questionResultShown = false;
var answerPhase = false; // true = answered, action-btn = continue
var currentWarnKey = null; // 当前警告提示的文案 key（kanjiWarn / plainHint），切换语言时重新渲染
var totalQuestionNum = 20; // 每局题目总数（n），暂定 20，后续完善显示逻辑
var answeredCount = 0;     // 已答题数（m）
var totalTime = 60;        // 挑战模式全局总时长（秒），暂定 60
var remainTime = totalTime;// 挑战模式剩余时间（全局倒计时，非每题倒计时）
var timeExpired = false;   // 挑战模式计时是否已归零
var studyWrongState = false; // 学习模式答错标记：答错时进度条变红，进入下一题后复位为绿

// ====== 题目类型池（六类随机，te/kedo 为动态拼接）=======
var ALL_FORMS = ['original', 'neg', 'past', 'past_neg', 'te', 'kedo'];

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
        // 警告状态下切换语言时，保持警告文本（含 feed-line1/feed-line2 样式结构）并重新渲染对应语言
        if (currentWarnKey && el.id === 'feed-area') {
            var warnLines = getWarnLines(currentWarnKey);
            el.innerHTML = '<div class="feed-line1">' + warnLines.line1 + '</div>' + (warnLines.line2 ? '<div class="feed-line2">' + warnLines.line2 + '</div>' : '');
            return;
        }
        if (key === 'checkBtn' && answerPhase) {
            el.innerText = dict['continueBtn'];
        } else {
            el.innerText = dict[key];
        }
    });
    // 输入框占位符跟随语言切换
    document.getElementById('ans-input').placeholder = dict['inputPlaceholder'];
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
    document.getElementById('lang-switch').classList.toggle('ja', currentLang === 'ja');
    document.getElementById('lang-ja').classList.toggle('active', currentLang === 'ja');
    document.getElementById('lang-en').classList.toggle('active', currentLang === 'en');
}

function refreshTimerText() {
    if (baseMode === 'challenge') {
        var dict = langData[currentLang];
        var timerEl = document.getElementById('timer-area');
        timerEl.innerText = dict.timerLabel + remainTime;
        timerEl.classList.toggle('danger', remainTime <= 5); // 剩余时间 ≤5 秒时变红
    }
}

// 刷新已答题数进度（m / n），仅在学习模式显示
function refreshProgressText() {
    document.getElementById('progress-area').innerText = answeredCount + ' / ' + totalQuestionNum;
}

// 刷新进度条（学习=已答数，挑战=剩余时间）
// 学习：绿色；答错（incorrect）时变红，点 Next 进入下一题后恢复绿色
// 挑战：默认黄；剩余 ≤5 秒时红
function refreshProgressBar() {
    var fill = document.getElementById('progress-fill');
    var pct, cls;
    if (baseMode === 'challenge') {
        pct = remainTime / totalTime * 100;
        cls = remainTime <= 5 ? 'fill-red' : 'fill-yellow';
    } else {
        pct = answeredCount / totalQuestionNum * 100;
        cls = studyWrongState ? 'fill-red' : 'fill-green'; // 答错变红，平时绿色
    }
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    fill.className = 'progress-fill ' + cls;
}

function refreshFeedbackText() {
    var feedArea = document.getElementById('feed-area');
    var dict = langData[currentLang];
    if (feedArea.classList.contains('correct-text')) {
        feedArea.innerHTML = '<div class="feed-line1">' + dict.correctTitle + '</div><div class="feed-line2">+10' + (currentLang === 'ja' ? '点' : 'pts') + '</div>';
    } else if (feedArea.classList.contains('timeout-text')) {
        // 超时结果：切换语言时保持 "Time's up!" 文案不变
        feedArea.innerHTML = '<div class="feed-line1">' + dict.timeOverTitle + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.target + '</div>';
    } else {
        feedArea.innerHTML = '<div class="feed-line1">' + dict.wrongTitle + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.target + '</div>';
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

function getRandomWord() {
    return vocabulary[Math.floor(Math.random() * vocabulary.length)];
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ====== 单形题生成（original / neg / past / past_neg）=======
function makeSingleForm(form, w) {
    var target, plainTarget, en;
    if (form === 'original') {
        target = politeRules.original(w);
        plainTarget = plainRules.original(w);
        en = w.en;
    } else if (form === 'neg') {
        target = politeRules.neg(w);
        plainTarget = plainRules.neg(w);
        en = 'not ' + w.en;
    } else if (form === 'past') {
        target = politeRules.past(w);
        plainTarget = plainRules.past(w);
        en = 'was ' + w.en;
    } else { // past_neg
        target = politeRules.past_neg(w);
        plainTarget = plainRules.past_neg(w);
        en = 'was not ' + w.en;
    }
    return {
        en: en,
        target: target,
        plainTarget: plainTarget,
        baseWord: w.base,
        form: form
    };
}

// ====== 组合题生成（te / kedo：随机两词动态拼接，前后均为现在肯定）=======
function makePairForm(form) {
    var a = getRandomWord();
    var b = getRandomWord();
    var guard = 0;
    while (a.base === b.base && guard < 30) {
        b = getRandomWord();
        guard++;
    }
    var target, plainTarget, en;
    if (form === 'te') {
        target = politeRules.te(a) + b.base + 'です';
        plainTarget = plainRules.te(a) + (b.type === 'n' ? b.base + 'だ' : b.base);
        en = a.en + ' and ' + b.en;
    } else { // kedo
        target = politeRules.kedo(a) + b.base + 'です';
        plainTarget = plainRules.kedo(a) + (b.type === 'n' ? b.base + 'だ' : b.base);
        en = a.en + ' but ' + b.en;
    }
    return {
        en: en,
        target: target,
        plainTarget: plainTarget,
        baseWord: a.base + '+' + b.base,
        form: form
    };
}

// ====== 抽题（六类随机）=======
function pickNextQuestion() {
    if (practiceMistakeMode) {
        if (mistakeQuestionPool.length <= 0) return null;
        var m = mistakeQuestionPool.shift();
        return {
            en: m.en,
            target: m.correctAns,
            plainTarget: m.plainAns || '',
            baseWord: m.baseWord || '',
            form: m.form || 'original'
        };
    }
    var form = pickRandom(ALL_FORMS);
    if (form === 'te' || form === 'kedo') return makePairForm(form);
    return makeSingleForm(form, getRandomWord());
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
    if (baseMode !== 'challenge') clearInterval(timerId); // 挑战模式为全局计时，换题不重置/不停表
    resetActionRow();
    currentWarnKey = null; // 新题重置警告状态
    var q = pickNextQuestion();
    if (!q) {
        backToHome();
        return;
    }
    currentQ = q;
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

    if (baseMode === 'challenge') {
        document.getElementById('progress-area').style.display = 'none';
        document.getElementById('timer-area').style.display = '';
        refreshTimerText();
        refreshProgressBar();
    } else {
        document.getElementById('timer-area').innerText = '';
        document.getElementById('timer-area').style.display = 'none';
        document.getElementById('progress-area').style.display = '';
        studyWrongState = false; // 进入下一题后进度条恢复绿色
        refreshProgressText();
        refreshProgressBar();
    }
    document.getElementById('ans-input').focus();
}

function startTimer() {
    clearInterval(timerId);
    refreshTimerText();
    refreshProgressBar();
    timerId = setInterval(function() {
        remainTime--;
        refreshTimerText();
        refreshProgressBar();
        if (remainTime <= 0) {
            clearInterval(timerId);
            timeExpired = true;
            if (!answerPhase) {
                finishAnswer(true); // 计时归零且当前题未作答时按超时判错
            }
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

// ====== 判题三段式（checkAnswer）======
// 1. 汉字拦截  2. 简体输入提示（polite 模式）  3. 正式判定
function checkAnswer(userInput) {
    var inputStr = userInput.trim();

    // ------ 拦截器 1：汉字检测 ------
    if (/[\u4E00-\u9FFF]/.test(inputStr)) {
        showWarnFeed('kanjiWarn');
        return; // 中断判题，不计分、不跳题、不停表
    }

    // ------ 拦截器 2：简体输入提示 ------
    if (inputStr === currentQ.plainTarget) {
        showWarnFeed('plainHint');
        return; // 中断判题，给用户机会自己补 です/でした
    }

    // ------ 正式判定（不可撤销）------
    if (baseMode !== 'challenge') clearInterval(timerId); // 学习模式答完停（无计时器）；挑战模式为全局计时不停
    currentWarnKey = null; // 进入正式判定后清除警告状态
    if (!practiceMistakeMode) attemptCount++;

    if (inputStr === currentQ.target) {
        answeredCount++;
        refreshProgressText();
        refreshProgressBar();
        score += 10;
        correctCount++;
        document.getElementById('score-num').innerText = score;
        animateScorePop();
        enterAnsweredState(true);
        document.getElementById('ans-input').readOnly = true;
        var dict = langData[currentLang];
        var feedArea = document.getElementById('feed-area');
        feedArea.className = 'correct-text';
        feedArea.innerHTML = '<div class="feed-line1">' + dict.correctTitle + '</div><div class="feed-line2">+10' + (currentLang === 'ja' ? '点' : 'pts') + '</div>';
        questionResultShown = true;
        if (practiceMistakeMode) {
            mistakeQuestionPool = mistakeQuestionPool.filter(function(item) { return item.en !== currentQ.en; });
            removeSolvedMistake(currentQ.en);
        }
    } else {
        if (!practiceMistakeMode) {
            var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
            if (!alreadyExist) {
                wrongCount++;
                attemptCount++;
                mistakeRecordList.push({
                    en: currentQ.en,
                    questionText: currentQ.en,
                    correctAns: currentQ.target,
                    plainAns: currentQ.plainTarget,
                    baseWord: currentQ.baseWord,
                    form: currentQ.form,
                    userAns: inputStr
                });
            }
        }
        finishAnswer(false);
    }
}

// 警告提示（拦截器用：橙色，不进入 answered 状态、不停表）
// key: langData 中的文案 key（kanjiWarn / plainHint），供切换语言时重新渲染

// 获取警告文案两行；兼容旧版 lang.js（单行 key 时回退为一行，避免显示 undefined）
function getWarnLines(key) {
    var dict = langData[currentLang];
    var line1 = dict[key + '1'];
    var line2 = dict[key + '2'];
    if (line1 === undefined || line2 === undefined) {
        return { line1: dict[key] != null ? dict[key] : '', line2: '' };
    }
    return { line1: line1, line2: line2 };
}

function showWarnFeed(key) {
    currentWarnKey = key;
    var feedArea = document.getElementById('feed-area');
    feedArea.className = 'warn-text';
    var lines = getWarnLines(key);
    feedArea.innerHTML = '<div class="feed-line1">' + lines.line1 + '</div>' + (lines.line2 ? '<div class="feed-line2">' + lines.line2 + '</div>' : '');
}

function finishAnswer(isTimeout) {
    isTimeout = isTimeout || false;
    var dict = langData[currentLang];

    currentWarnKey = null; // skip / 超时 / 错误 均离开警告状态
    document.getElementById('ans-input').readOnly = true;

    // 所有作答（答错 / 跳过 / 超时）都计入进度
    answeredCount++;
    refreshProgressText();

    // 学习模式：答错或跳过时进度条变红，点 Next 进入下一题后恢复绿色
    if (baseMode !== 'challenge') {
        studyWrongState = true;
    }

    refreshProgressBar();

    enterAnsweredState(false);

    var feedArea2 = document.getElementById('feed-area');
    feedArea2.className = isTimeout ? 'timeout-text' : 'wrong-text'; // 超时用独立 class，便于切换语言时保持 Time's up 且可单独着色
    var title = isTimeout ? dict.timeOverTitle : dict.wrongTitle;
    feedArea2.innerHTML = '<div class="feed-line1">' + title + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.target + '</div>';
    questionResultShown = true;

    if (!practiceMistakeMode) {
        var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
        if (!alreadyExist) {
            wrongCount++;
            attemptCount++;
            mistakeRecordList.push({
                en: currentQ.en,
                questionText: currentQ.en,
                correctAns: currentQ.target,
                plainAns: currentQ.plainTarget,
                baseWord: currentQ.baseWord,
                form: currentQ.form,
                userAns: document.getElementById('ans-input').value.trim()
            });
        }
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
            updateStartBtnState();
        };
    });

    document.querySelectorAll('.opt-item').forEach(function(btn) {
        btn.onclick = function() {
            document.querySelectorAll('.opt-item').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            subOpt = btn.dataset.val;
            // Show step1 (Mode)
            document.getElementById('step1-section').classList.add('visible');
            updateStartBtnState();
        };
    });

    document.getElementById('start-quiz').onclick = function() {
        if (!baseMode || !subOpt) {
            var dict2 = langData[currentLang];
            alert(currentLang === 'ja'
                ? 'モードとオプションをすべて選択してください'
                : 'Please select mode and options first');
            return;
        }
        switchScreen(document.getElementById('quiz-page'));
        score = 0; attemptCount = 0; correctCount = 0; wrongCount = 0;
        answeredCount = 0;
        mistakeRecordList = [];
        mistakeQuestionPool = [];
        practiceMistakeMode = false;
        questionResultShown = false;
        currentWarnKey = null;
        document.getElementById('score-num').innerText = score;
        if (baseMode === 'challenge') {
            remainTime = totalTime; // 开局重置全局计时
            timeExpired = false;
            startTimer(); // 全局计时只启动一次，换题不停
        }
        loadNewQuestion();
    };

    // Unified action button
    document.getElementById('action-btn').onclick = function() {
        if (answerPhase) {
            // 结束条件按模式区分：
            // 学习模式：答满 totalQuestionNum 题时结束；
            // 挑战模式：仅全局计时归零时结束（答题数只作进度显示，不触发结束）
            var isEnded = (baseMode === 'challenge')
                ? (timeExpired || remainTime <= 0)
                : (answeredCount >= totalQuestionNum);
            if (isEnded) {
                showSummary();
            } else {
                loadNewQuestion();
            }
        } else {
            // Check mode
            var userInput = document.getElementById('ans-input').value.trim();
            if (userInput === '') return;
            checkAnswer(userInput);
        }
    };

    document.getElementById('skip-btn').onclick = function() {
        if (answerPhase) return;
        if (baseMode !== 'challenge') clearInterval(timerId); // 挑战模式全局计时，跳过不停表
        var userInput = document.getElementById('ans-input').value.trim();
        if (!practiceMistakeMode) {
            var alreadyExist = mistakeRecordList.some(function(r) { return r.questionText === currentQ.en; });
            if (!alreadyExist) {
                mistakeRecordList.push({
                    en: currentQ.en,
                    questionText: currentQ.en,
                    correctAns: currentQ.target,
                    plainAns: currentQ.plainTarget,
                    baseWord: currentQ.baseWord,
                    form: currentQ.form,
                    userAns: userInput || '(SKIP)'
                });
            }
        }
        finishAnswer(false); // 跳过计入进度，且学习模式进度条变红
    };

    document.getElementById('practiceMistakeBtn').onclick = function() {
        if (mistakeRecordList.length === 0) {
            alert(currentLang === 'ja' ? 'ミスした問題はありません' : 'No mistakes in this session');
            return;
        }
        practiceMistakeMode = true;
        switchScreen(document.getElementById('quiz-page'));
        answeredCount = 0;
        mistakeQuestionPool = shuffleArray(mistakeRecordList.map(function(item) {
            return {
                en: item.en,
                questionText: item.questionText,
                correctAns: item.correctAns,
                plainAns: item.plainAns,
                baseWord: item.baseWord,
                form: item.form
            };
        }));
        currentWarnKey = null;
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
    var ready = !!(baseMode && subOpt);
    document.getElementById('start-quiz').disabled = !ready;
}

function backToHome() {
    clearInterval(timerId);
    resetActionRow(); // 返回首页前先复位按钮为两个（Split + Check），避免下次开始时才从合并的 Next 变回
    switchScreen(document.getElementById('home'));

    var prevBaseMode = baseMode;
    var prevSubOpt = subOpt;

    // Restore step visibility
    if (prevBaseMode) { document.getElementById('step1-section').classList.add('visible'); }

    document.querySelectorAll('.base-mode').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.opt-item').forEach(function(b) { b.classList.remove('active'); });

    // Re-highlight previously selected buttons
    if (prevBaseMode) {
        var baseBtn = document.querySelector('.base-mode[data-val="' + prevBaseMode + '"]');
        if (baseBtn) baseBtn.classList.add('active');
    }
    if (prevSubOpt) {
        var optBtn = document.querySelector('.opt-item[data-val="' + prevSubOpt + '"]');
        if (optBtn) optBtn.classList.add('active');
    }

    baseMode = prevBaseMode; subOpt = prevSubOpt;
    updateStartBtnState();
    score = 0; attemptCount = 0; correctCount = 0; wrongCount = 0;
    answeredCount = 0;
    remainTime = totalTime;   // 重置全局计时
    timeExpired = false;
    mistakeRecordList = [];
    mistakeQuestionPool = [];
    practiceMistakeMode = false;
    questionResultShown = false;
    currentWarnKey = null;
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