const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// 起動時ログ
console.log('🚀 村Gemini春樹 サーバー起動...');
console.log('📍 Node.js:', process.version);
console.log('📍 環境:', process.env.NODE_ENV || 'development');
console.log('📍 GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '設定済み' : '未設定');

// API KEYチェック
if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY が設定されていません');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;

// 使用するモデル（環境変数で切り替え可能）
// Renderの環境変数 GEMINI_MODEL で設定可能
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
console.log('📍 使用モデル:', GEMINI_MODEL);

// ミドルウェア設定
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

// 静的ファイル配信
app.use(express.static(path.join(__dirname, 'public')));

// レート制限
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 30,
    message: { error: 'リクエストが多すぎます。15分後に再度お試しください。' }
});
app.use('/api', limiter);

// リクエストログ
app.use((req, res, next) => {
    console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
// 🔍 デバッグ用エンドポイント（ブラウザからアクセス可能）
// URL: /api/debug-gemini
// ============================================================
app.get('/api/debug-gemini', async (req, res) => {
    console.log('🔍 デバッグ: Gemini APIレスポンス構造確認');
    
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    
    const testPrompt = `村上春樹の文体で、「雨の日の喫茶店」をテーマに300文字程度の短い文章を書いてください。`;
    
    const requestBody = {
        contents: [{ 
            parts: [{ text: testPrompt }] 
        }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        }
    };
    
    try {
        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        // 分析結果を構築
        const analysis = {
            httpStatus: response.status,
            model: GEMINI_MODEL,
            topLevelKeys: Object.keys(data),
            usageMetadata: data.usageMetadata || null,
            modelVersion: data.modelVersion || null,
            candidatesCount: data.candidates?.length || 0,
            partsAnalysis: []
        };
        
        if (data.candidates && data.candidates[0]) {
            const candidate = data.candidates[0];
            analysis.finishReason = candidate.finishReason;
            analysis.candidateKeys = Object.keys(candidate);
            
            if (candidate.content && candidate.content.parts) {
                candidate.content.parts.forEach((part, index) => {
                    const partInfo = {
                        index: index,
                        keys: Object.keys(part),
                        hasText: part.text !== undefined,
                        textLength: part.text ? part.text.length : 0,
                        hasThought: part.thought !== undefined,
                        thoughtValue: part.thought,
                        textPreview: part.text ? part.text.substring(0, 300) : null
                    };
                    analysis.partsAnalysis.push(partInfo);
                });
            }
        }
        
        // HTMLで見やすく表示
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Gemini API Debug</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 20px; background: #1a1a2e; color: #eee; }
        h1, h2 { color: #00d9ff; }
        pre { background: #16213e; padding: 15px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
        .part { border: 1px solid #00d9ff; padding: 15px; margin: 10px 0; border-radius: 8px; background: #16213e; }
        .warning { color: #ff6b6b; font-weight: bold; }
        .success { color: #51cf66; }
        .key { color: #ffd43b; }
        .info { background: #2d3436; padding: 10px; border-radius: 5px; margin: 5px 0; }
    </style>
</head>
<body>
    <h1>🔍 Gemini API レスポンス分析</h1>
    
    <h2>📋 基本情報</h2>
    <div class="info">
        <p><span class="key">モデル:</span> ${analysis.model}</p>
        <p><span class="key">HTTPステータス:</span> ${analysis.httpStatus}</p>
        <p><span class="key">モデルバージョン:</span> ${analysis.modelVersion || 'N/A'}</p>
        <p><span class="key">finishReason:</span> ${analysis.finishReason || 'N/A'}</p>
    </div>
    
    <h2>📊 トークン使用量</h2>
    <pre>${JSON.stringify(analysis.usageMetadata, null, 2)}</pre>
    
    <h2>📦 Parts配列の分析（重要！）</h2>
    <p>parts配列の長さ: <strong>${analysis.partsAnalysis.length}</strong></p>
    
    ${analysis.partsAnalysis.map((part, i) => `
    <div class="part">
        <h3>Part ${i}</h3>
        <p><span class="key">キー:</span> ${JSON.stringify(part.keys)}</p>
        <p><span class="key">text存在:</span> ${part.hasText ? '<span class="success">✅ あり</span>' : '<span class="warning">❌ なし</span>'}</p>
        <p><span class="key">text文字数:</span> <strong>${part.textLength}</strong></p>
        <p><span class="key">thought存在:</span> ${part.hasThought ? '<span class="warning">⚠️ あり (値: ' + part.thoughtValue + ')</span>' : '❌ なし'}</p>
        <p><span class="key">textプレビュー:</span></p>
        <pre>${part.textPreview || '(なし)'}</pre>
    </div>
    `).join('')}
    
    <h2>📋 生のJSONレスポンス</h2>
    <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// Gemini API呼び出し関数（修正版）
// ============================================================
async function callGeminiAPI(prompt, maxOutputTokens = 8192) {
    console.log(`🤖 ${GEMINI_MODEL} API呼び出し開始...`);
    console.log(`📊 maxOutputTokens: ${maxOutputTokens}`);
    
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY が設定されていません');
        }
        
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
        
        const requestBody = {
            contents: [{ 
                parts: [{ text: prompt }] 
            }],
            generationConfig: {
                temperature: 0.8,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: maxOutputTokens,
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
            ]
        };
        
        console.log(`📡 ${GEMINI_MODEL} にリクエスト送信中...`);
        
        const response = await fetch(`${apiUrl}?key=${apiKey}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'MuraGeminiHaruki/1.0'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📨 API応答ステータス:', response.status);
        
        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                console.error('❌ Gemini API エラー:', JSON.stringify(errorData, null, 2));
                if (errorData.error) {
                    errorMessage = errorData.error.message || errorMessage;
                }
            } catch (e) {
                console.error('❌ エラーレスポンスのパース失敗');
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log(`✅ ${GEMINI_MODEL} 応答受信成功`);
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error('AI応答が生成されませんでした');
        }
        
        const candidate = data.candidates[0];
        console.log('📊 finishReason:', candidate.finishReason);
        
        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
            throw new Error('AI応答のコンテンツが空です');
        }
        
        // ============================================================
        // parts配列から正しいテキストを取得
        // gemini-2.5-flashは thought: true のpartを含む場合があるため対応
        // ============================================================
        const parts = candidate.content.parts;
        console.log(`📊 parts配列の長さ: ${parts.length}`);
        
        let generatedText = '';
        
        // 各partをログ出力
        parts.forEach((part, index) => {
            const hasThought = part.thought === true;
            const textLength = part.text ? part.text.length : 0;
            console.log(`📊 parts[${index}]: thought=${hasThought}, textLength=${textLength}`);
        });
        
        // 方法1: thought: true でないpartからテキストを取得
        for (const part of parts) {
            if (part.text && part.thought !== true) {
                generatedText = part.text;
                console.log('✅ thought=falseのpartからテキスト取得');
                break;
            }
        }
        
        // 方法2: 見つからなかった場合、最も長いテキストを持つpartを使用
        if (!generatedText) {
            let longestText = '';
            for (const part of parts) {
                if (part.text && part.text.length > longestText.length) {
                    longestText = part.text;
                }
            }
            generatedText = longestText;
            if (generatedText) {
                console.log('⚠️ 最も長いpartからテキスト取得（フォールバック）');
            }
        }
        
        // 方法3: それでも見つからなかった場合、最初のpartのtext
        if (!generatedText && parts.length > 0 && parts[0].text) {
            generatedText = parts[0].text;
            console.log('⚠️ 最初のpartからテキスト取得（最終フォールバック）');
        }
        
        if (!generatedText) {
            throw new Error('生成されたテキストが空です');
        }
        
        console.log('✅ テキスト生成成功 - 文字数:', generatedText.length);
        
        // トークン使用量をログ
        if (data.usageMetadata) {
            console.log('📊 トークン使用量:', JSON.stringify(data.usageMetadata));
        }
        
        return generatedText.trim();
        
    } catch (error) {
        console.error(`❌ ${GEMINI_MODEL} API エラー:`, error);
        throw error;
    }
}

// プロローグ生成API
app.post('/api/generate-prolog', async (req, res) => {
    console.log('📖 プロローグ生成開始');
    
    try {
        const { characters, setting, genre } = req.body;

        // 入力値検証
        if (!characters || !Array.isArray(characters) || characters.length !== 3) {
            return res.status(400).json({ 
                error: '登場人物3人を正しく入力してください' 
            });
        }
        
        if (!setting || !genre) {
            return res.status(400).json({ 
                error: '舞台設定とジャンルを入力してください' 
            });
        }

        console.log('👥 登場人物:', characters);
        console.log('🏛️ 舞台:', setting);
        console.log('🎭 ジャンル:', genre);

        const prompt = `あなたは村上春樹の文体を完璧に模倣できる小説家です。

以下の設定で小説のプロローグを書いてください。

【設定】
- 登場人物: ${characters.join('、')}
- 舞台: ${setting}
- ジャンル: ${genre}

【必須要件】
1. 文字数: 必ず400文字前後（350〜450文字）で書くこと
2. 文章は途中で切らず、必ず完結させること
3. 村上春樹らしい文体で書くこと

【村上春樹の文体特徴】
- 「僕」または三人称での語り
- 内省的で詩的な表現
- 日常の中に不思議さを織り込む
- 具体的な固有名詞（音楽、食べ物、本）
- 繊細で美しい比喩表現
- 冷静な観察者的視点
- 現代都市生活の空気感

【内容】
- 読者の興味を引く導入部分
- 登場人物3人の関係性を示唆
- そのジャンルらしい雰囲気

それでは、350〜450文字のプロローグを書いてください。`;

        // プロローグ用: 2048トークン
        let prolog = await callGeminiAPI(prompt, 2048);
        
        console.log('✅ プロローグ生成成功 - 文字数:', prolog.length);
        
        // 文字数が極端に短い場合は再生成
        if (prolog.length < 200) {
            console.warn(`⚠️ プロローグが短すぎます（${prolog.length}文字）。再生成します`);
            const retryPrompt = `${prompt}\n\n【重要】必ず350文字以上450文字以下で書いてください。短すぎる場合は描写を追加してください。`;
            prolog = await callGeminiAPI(retryPrompt, 2048);
            console.log('📊 再生成後の文字数:', prolog.length);
        }
        
        res.json({ prolog });

    } catch (error) {
        console.error('❌ プロローグ生成エラー:', error);
        
        if (error.message.includes('認証') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('制限') || error.message.includes('上限') || error.message.includes('429')) {
            res.status(429).json({ error: 'API利用制限に達しました。しばらく待ってから再度お試しください。' });
        } else {
            res.status(500).json({ error: 'プロローグの生成中にエラーが発生しました。もう一度お試しください。' });
        }
    }
});

// 完成版小説生成API
app.post('/api/generate-story', async (req, res) => {
    console.log('📚 完成版小説生成開始');
    
    try {
        const { characters, setting, genre, feedback } = req.body;

        if (!characters || !Array.isArray(characters) || characters.length !== 3) {
            return res.status(400).json({ error: '登場人物3人が必要です' });
        }
        
        if (!setting || !genre) {
            return res.status(400).json({ error: '舞台設定とジャンルを入力してください' });
        }

        console.log('👥 登場人物:', characters);
        console.log('🏛️ 舞台:', setting);
        console.log('🎭 ジャンル:', genre);
        console.log('💭 フィードバック:', feedback || 'なし');

        const prompt = `あなたは村上春樹の文体を完璧に模倣できる小説家です。

以下の設定で完成された短編小説を書いてください。

【設定】
- 登場人物: ${characters.join('、')}
- 舞台: ${setting}
- ジャンル: ${genre}
${feedback ? `- 特別な要望: ${feedback}` : ''}

【必須要件】
1. 文字数: 必ず3500〜4500文字で書くこと（4000文字前後が理想）
2. 完結した物語にすること（起承転結がある）
3. 村上春樹らしい文体で書くこと

【構成の目安】
- 第一部（導入）: 約1000文字 - 登場人物紹介、状況設定
- 第二部（展開）: 約1500文字 - 事件、出会い、関係性の変化
- 第三部（クライマックス）: 約1000文字 - 心理的転換点
- 第四部（結末）: 約500文字 - 詩的で余韻のある終わり

【村上春樹の文体特徴】
- 「僕」または三人称での語り
- 内省的で詩的な表現
- 日常の中に不思議さを織り込む
- 具体的な固有名詞（ビートルズ、パスタ、カフカなど）
- 繊細で美しい比喩表現
- 会話と独白のバランス
- 現代都市生活の空気感

【描写を豊富に含める】
- 情景描写（場所、時間、天候、光）
- 心理描写（内面の揺れ、感情の機微）
- 人物描写（仕草、表情、服装）
- 感覚描写（音、匂い、温度、触感）

それでは、3500〜4500文字の完成された短編小説を書いてください。`;

        // 完成版小説用: 8192トークン
        let story = await callGeminiAPI(prompt, 8192);
        
        console.log('✅ 完成版小説生成成功 - 文字数:', story.length);
        
        // 文字数が不足している場合、再生成を試みる
        let retryCount = 0;
        const maxRetries = 2;
        
        while (story.length < 2000 && retryCount < maxRetries) {
            retryCount++;
            console.warn(`⚠️ 小説が短すぎます（${story.length}文字）。再生成を試みます（${retryCount}/${maxRetries}）...`);
            
            const retryPrompt = `${prompt}\n\n【重要な追加指示】\n前回の生成が${story.length}文字と短すぎました。\n必ず3500文字以上4500文字以下で完成させてください。\n各セクションで十分な描写を入れ、物語を丁寧に展開してください。`;
            
            story = await callGeminiAPI(retryPrompt, 8192);
            console.log(`📊 再生成後の文字数: ${story.length}`);
        }
        
        if (story.length < 2000) {
            console.error(`❌ 再生成しても文字数が不足しています（${story.length}文字）`);
        } else {
            console.log(`✅ 文字数OK（${story.length}文字）`);
        }
        
        res.json({ story });

    } catch (error) {
        console.error('❌ 完成版小説生成エラー:', error);
        
        if (error.message.includes('認証') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('制限') || error.message.includes('上限') || error.message.includes('429')) {
            res.status(429).json({ error: 'API利用制限に達しました。しばらく待ってから再度お試しください。' });
        } else {
            res.status(500).json({ error: '小説の生成中にエラーが発生しました。もう一度お試しください。' });
        }
    }
});

// メインページ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェック
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: '村Gemini春樹',
        model: GEMINI_MODEL,
        hasGeminiKey: !!process.env.GEMINI_API_KEY
    });
});

// 404ハンドラー
app.use((req, res) => {
    res.status(404).json({ error: 'ページが見つかりません' });
});

// エラーハンドラー
app.use((err, req, res, next) => {
    console.error('❌ サーバーエラー:', err);
    res.status(500).json({ 
        error: 'サーバー内部エラーが発生しました',
        timestamp: new Date().toISOString()
    });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log('🌟 村Gemini春樹 サーバー起動完了!');
    console.log(`📡 ポート: ${PORT}`);
    console.log(`🤖 モデル: ${GEMINI_MODEL}`);
    console.log(`🔑 Gemini APIキー: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}`);
    console.log(`🔍 デバッグURL: /api/debug-gemini`);
    console.log(`⏰ 開始時刻: ${new Date().toISOString()}`);
});
