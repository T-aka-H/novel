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

// 利用可能なGeminiモデルを順番に試す
async function tryGeminiModels(prompt) {
    const models = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp',
        'gemini-pro'
    ];
    
    for (const model of models) {
        try {
            console.log(`🔄 ${model} を試行中...`);
            const result = await callGeminiAPIWithModel(prompt, model);
            console.log(`✅ ${model} で成功!`);
            return result;
        } catch (error) {
            console.log(`❌ ${model} 失敗: ${error.message}`);
            continue;
        }
    }
    
    throw new Error('すべてのGeminiモデルで失敗しました');
}

// 特定モデルでAPI呼び出し
async function callGeminiAPIWithModel(prompt, modelName) {
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const requestBody = {
        contents: [{ 
            parts: [{ text: prompt }] 
        }],
        generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
        },
        safetySettings: [
            {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
        ]
    };
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'MuraGeminiHaruki/1.0'
        },
        body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            if (errorData.error) {
                errorMessage = errorData.error.message || errorMessage;
            }
        } catch (e) {
            // エラーパース失敗は無視
        }
        throw new Error(errorMessage);
    }
    
    const data = await response.json();
    
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error('AI応答が生成されませんでした');
    }
    
    const candidate = data.candidates[0];
    if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        throw new Error('AI応答のコンテンツが空です');
    }
    
    const generatedText = candidate.content.parts[0].text;
    if (!generatedText) {
        throw new Error('生成されたテキストが空です');
    }
    
    return generatedText.trim();
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

        const prompt = `以下の設定で400文字程度の小説プロローグを村上春樹の文体で書いてください。

## 設定
- 登場人物: ${characters.join('、')}
- 舞台: ${setting}
- ジャンル: ${genre}

## 村上春樹文体の特徴
- 現代的で洗練された文章
- 内省的で詩的な表現
- 日常的な出来事の中に不思議さを織り込む
- 「僕」「彼」「彼女」などの三人称での語り
- 少し距離感のある冷静な観察者的視点
- 音楽、食べ物、本などの具体的な固有名詞
- 繊細で美しい比喩表現（「まるで〜のように」）
- 現代都市生活の空気感

## 要件
- 400文字程度の長さ
- 村上春樹らしい現代的で洗練された文体
- 縦書きでの表示に適した文章
- 読者の興味を引く魅力的な導入部分
- 登場人物3人の関係性や立ち位置を自然に示唆
- そのジャンルらしい雰囲気を醸成しつつ、村上春樹的な不思議さも含む

## 注意事項
- 古典的な表現（〜のでした、〜でございます）は使わない
- 現代的で自然な日本語を使用
- 村上春樹の代表作のような雰囲気を意識する`;

        const prolog = await tryGeminiModels(prompt);
        
        console.log('✅ プロローグ生成成功');
        res.json({ prolog });

    } catch (error) {
        console.error('❌ プロローグ生成エラー:', error);
        
        if (error.message.includes('認証') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('制限') || error.message.includes('上限')) {
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

        const prompt = `以下の設定で4000文字程度の完成された小説を村上春樹の文体で書いてください。

## 設定
- 登場人物: ${characters.join('、')}
- 舞台: ${setting}
- ジャンル: ${genre}
${feedback ? `- ユーザーからの要望: ${feedback}` : ''}

## 村上春樹文体の特徴
- 現代的で洗練された文章
- 内省的で詩的な表現
- 日常的な出来事の中に不思議さやシュルレアリスムを織り込む
- 「僕」「彼」「彼女」などの三人称での語り
- 少し距離感のある冷静な観察者的視点
- 音楽、食べ物、本、ブランドなどの具体的な固有名詞
- 繊細で美しい比喩表現（「まるで〜のように」）
- 現代都市生活の空気感とやや退廃的な雰囲気
- 時に哲学的で思索的な内容
- 会話は自然でリアルな現代語

## 要件
- 4000文字程度の完成作品
- 起承転結のしっかりした構成
- 村上春樹らしい現代的で洗練された文体
- 縦書きでの表示に適した文章
- 登場人物3人の心理描写と成長を繊細に描く
- 余韻のある詩的な結末
- そのジャンルの特色を活かしつつ、村上春樹的な不思議さも含む
- 現代的な都市生活の中での人間関係を描く

## 構成指針
1. 導入: キャラクター紹介と状況設定、村上春樹的な雰囲気の確立（1000文字程度）
2. 展開: 事件や出会い、関係性の変化、内省的な描写（1500文字程度）
3. クライマックス: 心理的な転換点や感情的な場面（1000文字程度）
4. 結末: 詩的で余韻のある終わり方（500文字程度）

## 注意事項
- 古典的な表現（〜のでした、〜でございます）は使わない
- 現代的で自然な日本語を使用
- 村上春樹の代表作品の雰囲気を意識する
- 読者が深い余韻と満足感を得られる作品にする`;

        const story = await tryGeminiModels(prompt);
        
        console.log('✅ 完成版小説生成成功');
        res.json({ story });

    } catch (error) {
        console.error('❌ 完成版小説生成エラー:', error);
        
        if (error.message.includes('認証') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('制限') || error.message.includes('上限')) {
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
    console.log(`🔑 Gemini APIキー: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}`);
    console.log(`⏰ 開始時刻: ${new Date().toISOString()}`);
});