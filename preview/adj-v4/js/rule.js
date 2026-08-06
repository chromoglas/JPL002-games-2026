// ============================================================
// 词汇表 (Vocabulary) —— 运行时从 JSON 加载，支持默认词库 + 用户扩展合并
// type: "i" = い形容词, "n" = な形容词, "s" = 特殊词干(いい/〜いい结尾)
// stage: 预留给未来授课进度过滤（当前版本未参与过滤）
// ============================================================
var vocabulary = [];

// ============================================================
// 加载默认词库（从 JSON 文件异步加载）
// 后续可扩展：与 localStorage 用户词库合并
// ============================================================
function loadDefaultVocabulary() {
    return fetch('js/default-vocabulary.json')
        .then(function(res) {
            if (!res.ok) throw new Error('Failed to load vocabulary: ' + res.status);
            return res.json();
        })
        .then(function(data) {
            vocabulary = data;
            return vocabulary;
        });
}

// ============================================================
// 词干提取 (Stem Extractor)
//   i 形: 去掉末尾"い"       例: たのしい -> たのし
//   s 形: 结尾"いい" -> "よ"  例: いい -> よ , かっこいい -> かっこよ
//   n 形: 词干即 base 本身    例: きれい -> きれい
// ============================================================
function getStem(wordObj) {
    if (wordObj.type === "i") return wordObj.base.slice(0, -1);
    if (wordObj.type === "s") return (wordObj.base === "いい") ? "よ" : wordObj.base.replace(/いい$/, "よ");
    return wordObj.base;
}

// ============================================================
// 简体变形规则 (Plain Form)
// 注: te/kedo 为句中连接形，简体/敬体通用，与 politeRules 共享
// ============================================================
var plainRules = {
    original: function(w) { return w.type === "n" ? w.base + "だ" : w.base; },
    neg:      function(w) { return w.type === "n" ? w.base + "じゃない" : getStem(w) + "くない"; },
    past:     function(w) { return w.type === "n" ? w.base + "だった" : getStem(w) + "かった"; },
    past_neg: function(w) { return w.type === "n" ? w.base + "じゃなかった" : getStem(w) + "くなかった"; },
    te:       function(w) { return w.type === "n" ? w.base + "で" : getStem(w) + "くて"; },
    kedo:     function(w) { return w.type === "n" ? w.base + "だけど" : w.base + "けど"; }
};

// ============================================================
// 敬体变形规则 (Polite / Desumasu Form)
// te/kedo 句中连接形无敬体区分，直接复用简体规则
// ============================================================
var politeRules = {
    original:  function(w) { return w.base + "です"; },
    neg:       function(w) { return w.type === "n" ? w.base + "じゃないです" : getStem(w) + "くないです"; },
    past:      function(w) { return w.type === "n" ? w.base + "でした" : getStem(w) + "かったです"; },
    past_neg:  function(w) { return w.type === "n" ? w.base + "じゃなかったです" : getStem(w) + "くなかったです"; },
    // ---- 敬体否定/过去否定变体（な形容詞专用，预留暂未调用）----
    neg1:      function(w) { return w.type === "n" ? w.base + "ではないです" : getStem(w) + "くないです"; },
    neg2:      function(w) { return w.type === "n" ? w.base + "じゃありません" : getStem(w) + "くないです"; },
    neg3:      function(w) { return w.type === "n" ? w.base + "ではありません" : getStem(w) + "くないです"; },
    past_neg1: function(w) { return w.type === "n" ? w.base + "ではなかったです" : getStem(w) + "くなかったです"; },
    past_neg2: function(w) { return w.type === "n" ? w.base + "じゃありませんでした" : getStem(w) + "くなかったです"; },
    past_neg3: function(w) { return w.type === "n" ? w.base + "ではありませんでした" : getStem(w) + "くなかったです"; },
    te:        function(w) { return plainRules.te(w); },
    kedo:      function(w) { return plainRules.kedo(w); }
};
