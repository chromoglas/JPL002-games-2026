var currentLang = 'en';
var recordList = [];
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
    // 离开 summary 页面时淡出并清除彩条
    if (current && current.id === 'summary-page') {
        clearConfetti();
    }
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
        document.getElementById('question-area').innerText = currentQ.en;
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
    document.getElementById('progress-area').innerText = '📖 ' + answeredCount + ' / ' + totalQuestionNum;
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
        en = 'NOT ' + w.en;
    } else if (form === 'past') {
        target = politeRules.past(w);
        plainTarget = plainRules.past(w);
        en = 'WAS ' + w.en;
    } else { // past_neg
        target = politeRules.past_neg(w);
        plainTarget = plainRules.past_neg(w);
        en = 'WAS NOT ' + w.en;
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
        en = a.en + ' AND ' + b.en;
    } else { // kedo
        target = politeRules.kedo(a) + b.base + 'です';
        plainTarget = plainRules.kedo(a) + (b.type === 'n' ? b.base + 'だ' : b.base);
        en = a.en + ' BUT ' + b.en;
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
    var form = pickRandom(ALL_FORMS);
    if (form === 'te' || form === 'kedo') return makePairForm(form);
    return makeSingleForm(form, getRandomWord());
}

function updateActionBtnState() {
    var btn = document.getElementById('action-btn');
    if (answerPhase) return;
    var inputVal = document.getElementById('ans-input').value.trim();
    btn.disabled = (inputVal === '');
}

function resetActionRow() {
    answerPhase = false;
    var row = document.getElementById('action-row');
    row.classList.remove('answered');
    var actionBtn = document.getElementById('action-btn');
    actionBtn.classList.remove('wrong');
    actionBtn.innerText = langData[currentLang]['checkBtn'];
    updateActionBtnState();
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
    document.getElementById('question-area').innerText = currentQ.en;
    document.getElementById('ans-input').value = '';
    document.getElementById('ans-input').readOnly = false;
    updateActionBtnState();
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
                finishAnswer(true, false); // 计时归零且当前题未作答时按超时判错
            }
        }
    }, 1000);
}

function enterAnsweredState(isCorrect) {
    answerPhase = true;
    var row = document.getElementById('action-row');
    row.classList.add('answered');
    var actionBtn = document.getElementById('action-btn');
    actionBtn.disabled = false;
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

    if (inputStr === currentQ.target) {
        attemptCount++;
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
        // 记录正确回答
        recordList.push({
            en: currentQ.en,
            correctAns: currentQ.target,
            userAns: inputStr,
            isCorrect: true
        });
    } else {
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

function finishAnswer(isTimeout, isSkip) {
    isTimeout = isTimeout || false;
    isSkip = isSkip || false;
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
    feedArea2.className = isTimeout ? 'timeout-text' : 'wrong-text';
    var title = isTimeout ? dict.timeOverTitle : dict.wrongTitle;
    feedArea2.innerHTML = '<div class="feed-line1">' + title + '</div><div class="feed-line2">' + dict.answerPrefix + currentQ.target + '</div>';
    questionResultShown = true;

    // 尝试次数与错误次数必定无条件累加
    wrongCount++;
    attemptCount++;
    
    // 记录错误/跳过/超时回答（全部计入，不提前判断重复）
    var uAns = document.getElementById('ans-input').value.trim();
    if (isTimeout) uAns = '(TIMEOUT)';
    else if (isSkip) uAns = '(SKIP)';
    else if (!uAns) uAns = '(BLANK)';

    recordList.push({
        en: currentQ.en,
        correctAns: currentQ.target,
        userAns: uAns,
        isCorrect: false
    });
}

// ====== Event Bindings ======
document.addEventListener('DOMContentLoaded', function() {
    loadDefaultVocabulary().then(function() {
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
        resetAllState({ keepMode: true }); // 保留已选模式，统一清理其余状态
        switchScreen(document.getElementById('quiz-page'));
        if (baseMode === 'challenge') {
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
        finishAnswer(false, true); // 跳过计入进度，且学习模式进度条变红
    };

    // Review 模态窗口：点击按钮打开，点击遮罩或关闭按钮关闭
    document.getElementById('review-btn').onclick = function() {
        renderRecordTable(); // 打开弹窗前渲染解答记录表格
        openReviewModal();
    };

    // Check 按钮状态随输入框实时联动
    var ansInput = document.getElementById('ans-input');
    ansInput.addEventListener('input', updateActionBtnState);

    // IME-aware Enter key
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
    }); // end loadDefaultVocabulary
}); // end DOMContentLoaded

function updateStartBtnState() {
    var ready = !!(baseMode && subOpt);
    document.getElementById('start-quiz').disabled = !ready;
}

// ====== Review 模态窗口：渲染解答记录表格 ======
function renderRecordTable() {
    var tbody = document.getElementById('recordTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    recordList.forEach(function(item, idx) {
        var rowClass = item.isCorrect ? 'record-correct' : 'record-wrong';
        var tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML =
            '<td>' + (idx + 1) + '</td>' +
            '<td>' + item.en + '</td>' +
            '<td>' + item.correctAns + '</td>' +
            '<td>' + item.userAns + '</td>';
        tbody.appendChild(tr);
    });
}

function openReviewModal() {
    document.getElementById('review-modal').classList.add('show');
}

function closeReviewModal() {
    document.getElementById('review-modal').classList.remove('show');
}

// ====== 统一状态清理函数 ======
// opts.keepMode: true 时保留 baseMode / subOpt（Play Again 沿用上次选择），其余全部清空
function resetAllState(opts) {
    opts = opts || {};
    // 停止计时器
    clearInterval(timerId);
    // 清除彩条（若在 summary 页面）
    clearConfetti();
    // 复位答题按钮 DOM（Skip + Check 拆分状态）
    resetActionRow();
    // 清空记录表 DOM 防残留
    var tbody = document.getElementById('recordTableBody');
    if (tbody) tbody.innerHTML = '';
    // 重置全部运行态变量
    score = 0; attemptCount = 0; correctCount = 0; wrongCount = 0;
    answeredCount = 0;
    remainTime = totalTime;
    timeExpired = false;
    recordList = [];
    questionResultShown = false;
    currentWarnKey = null;
    currentQ = null;
    studyWrongState = false;
    document.getElementById('score-num').innerText = score;
    // 模式选择：默认清空，keepMode 时保留
    if (!opts.keepMode) {
        baseMode = null;
        subOpt = null;
    }
    updateStartBtnState();
}

// ====== Exit：清空状态并返回首页（index） ======
function exitGame() {
    resetAllState(); // 完全清空状态（含模式选择）
    // 返回根目录 index.html（从 preview/adj-v4/ 上跳两级）
    window.location.href = '../../index.html';
}

function backToHome() {
    // 保留 baseMode / subOpt（Play Again 沿用上次选择），其余状态统一清理
    resetAllState({ keepMode: true });
    switchScreen(document.getElementById('home'));

    // Restore step visibility
    if (baseMode) { document.getElementById('step1-section').classList.add('visible'); }

    document.querySelectorAll('.base-mode').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.opt-item').forEach(function(b) { b.classList.remove('active'); });

    // Re-highlight previously selected buttons
    if (baseMode) {
        var baseBtn = document.querySelector('.base-mode[data-val="' + baseMode + '"]');
        if (baseBtn) baseBtn.classList.add('active');
    }
    if (subOpt) {
        var optBtn = document.querySelector('.opt-item[data-val="' + subOpt + '"]');
        if (optBtn) optBtn.classList.add('active');
    }
}

// ====== Confetti (彩条飘落) ======
var CONFETTI_COLORS = ['#ff718d', '#fdff6a', '#74f2ce', '#3ea6ff', '#ffb03a', '#b980ff'];
var confettiTimers = [];
var confettiClearTimer = null; // 延迟清除彩条层的计时器：避免旧代际的清除误删新彩条

function createConfetti(amount) {
    // 若有挂起的延迟清除，先取消，防止 550ms 后误删本次新创建的彩条
    if (confettiClearTimer) { clearTimeout(confettiClearTimer); confettiClearTimer = null; }
    var layer = document.getElementById('confetti-layer');
    // 同步清空残留彩条 DOM（如快速重开后旧彩条未被清除的情况），确保本轮只显示新彩条
    layer.innerHTML = '';
    layer.classList.remove('fading');
    for (var i = 0; i < amount; i++) {
        var confetti = document.createElement('div');
        confetti.classList.add('confetti');

        var color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
        var left = Math.random() * 100;
        var width = Math.random() * 8 + 6;
        var height = Math.random() * 20 + 15;
        var duration = Math.random() * 1.3 + 1.2;
        var delay = Math.random() * 0.8;
        var startRot = Math.random() * 360;
        var endRot = startRot + 360 + Math.random() * 720;

        confetti.style.backgroundColor = color;
        confetti.style.left = left + 'vw';
        confetti.style.width = width + 'px';
        confetti.style.height = height + 'px';
        confetti.style.setProperty('--duration', duration + 's');
        confetti.style.setProperty('--delay', delay + 's');
        confetti.style.setProperty('--start-rot', startRot + 'deg');
        confetti.style.setProperty('--end-rot', endRot + 'deg');

        layer.appendChild(confetti);

        // 动画结束后自动移除 DOM 元素，防止内存泄漏
        (function(el, d, dl) {
            confettiTimers.push(setTimeout(function() {
                el.remove();
            }, (d + dl) * 1000));
        })(confetti, duration, delay);
    }
}

// 退出 summary 页面时淡出并清除所有彩条
function clearConfetti() {
    confettiTimers.forEach(function(t) { clearTimeout(t); });
    confettiTimers = [];
    // 取消之前挂起的延迟清除，重新登记本次
    if (confettiClearTimer) { clearTimeout(confettiClearTimer); }
    var layer = document.getElementById('confetti-layer');
    layer.classList.add('fading');
    confettiClearTimer = setTimeout(function() {
        layer.innerHTML = '';
        layer.classList.remove('fading');
        confettiClearTimer = null;
    }, 550);
}

function showSummary() {
    clearInterval(timerId);
    switchScreen(document.getElementById('summary-page'));
    createConfetti(100);
    // 统计逻辑保留（attemptCount / correctCount / wrongCount / score 均已在答题过程中累计，备用展示时直接读取变量即可）
}