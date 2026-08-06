// ============================================================
// 词汇表 (Vocabulary) —— 仅存词源，所有变形由规则引擎动态生成
// type: "i" = い形容词, "n" = な形容词, "s" = 特殊词干(いい/〜いい结尾)
// stage: 预留给未来授课进度过滤（当前版本未参与过滤）
// ============================================================
var vocabulary = [
    // ---- い形容詞 ----
    { base: "たのしい",   type: "i", en: "fun",               stage: 1 },
    { base: "うれしい",   type: "i", en: "happy",             stage: 1 },
    { base: "おもしろい", type: "i", en: "interesting",       stage: 1 },
    { base: "あつい",     type: "i", en: "hot",               stage: 1 },
    { base: "さむい",     type: "i", en: "cold",              stage: 1 },
    { base: "やすい",     type: "i", en: "cheap",             stage: 1 },
    { base: "たかい",     type: "i", en: "expensive",         stage: 1 },
    { base: "ちいさい",   type: "i", en: "small",             stage: 1 },
    { base: "ひろい",     type: "i", en: "spacious",          stage: 2 },
    { base: "かわいい",   type: "i", en: "cute",              stage: 2 },
    { base: "ながい",     type: "i", en: "long",              stage: 2 },
    { base: "むずかしい", type: "i", en: "difficult",         stage: 2 },
    { base: "わかい",     type: "i", en: "young",             stage: 3 },
    { base: "つよい",     type: "i", en: "strong",            stage: 3 },
    { base: "あたらしい", type: "i", en: "new",               stage: 3 },
    { base: "あぶない",   type: "i", en: "dangerous",         stage: 3 },
    { base: "いそがしい", type: "i", en: "busy",              stage: 4 },
    { base: "あおい",     type: "i", en: "blue",              stage: 4 },
    { base: "くろい",     type: "i", en: "black",             stage: 4 },
    // ---- な形容詞 ----
    { base: "きれい",     type: "n", en: "beautiful / clean", stage: 1 },
    { base: "しずか",     type: "n", en: "quiet",             stage: 1 },
    { base: "ゆうめい",   type: "n", en: "famous",            stage: 2 },
    { base: "べんり",     type: "n", en: "convenient",        stage: 2 },
    { base: "げんき",     type: "n", en: "energetic",         stage: 2 },
    { base: "かんたん",   type: "n", en: "easy",              stage: 3 },
    { base: "とくい",     type: "n", en: "good at",           stage: 3 },
    { base: "にがて",     type: "n", en: "not good at",       stage: 3 },
    { base: "ひま",       type: "n", en: "free / idle",       stage: 4 },
    { base: "にぎやか",   type: "n", en: "lively",            stage: 4 },
    // ---- 特殊词干（いい / 〜いい 结尾）----
    { base: "いい",       type: "s", en: "good",              stage: 1 },
    { base: "かっこいい", type: "s", en: "cool / handsome",   stage: 2 }
];

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
    original: function(w) { return w.base + "です"; },
    neg:      function(w) { return w.type === "n" ? w.base + "じゃないです" : getStem(w) + "くないです"; },
    past:     function(w) { return w.type === "n" ? w.base + "でした" : getStem(w) + "かったです"; },
    past_neg: function(w) { return w.type === "n" ? w.base + "じゃなかったです" : getStem(w) + "くなかったです"; },
    te:       function(w) { return plainRules.te(w); },
    kedo:     function(w) { return plainRules.kedo(w); }
};