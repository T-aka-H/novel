const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// API KEYの存在チェック
if (!process.env.GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY environment variable is not set');
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;

// Renderに最適化された設定
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
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { error: 'リクエストが多すぎます。15分後に再度お試しください。' }
});
app.use('/api', limiter);

// Gemini API呼び出し関数
async function callGeminiAPI(prompt) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.9,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2048,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('AI応答が空でした');
        }
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API Error:', error);
        if (error.message.includes('API key')) {
            throw new Error('APIキーの設定に問題があります');
        }
        throw new Error('AI応答の生成に失敗しました');
    }
}

// プロローグ生成API
app.post('/api/generate-prolog', async (req, res) => {
    try {
        const { characters, setting, genre } = req.body;

        if (!characters || !Array.isArray(characters) || characters.length !== 3 || !setting || !genre) {
            return res.status(400).json({ 
                error: '登場人物3人、舞台設定、ジャンルを正しく入力してください' 
            });
        }

        const prompt = `以下の設定で400文字程度の小説プロローグを古典的な日本語文体で書いてください。

登場人物: ${characters.join('、')}
舞台: ${setting}
ジャンル: ${genre}

要件:
- 400文字程度
- 古典的文語調（〜のでした、〜でございます）
- 縦書き対応
- 読者の興味を引く導入
- 登場人物の関係性示唆`;

        const prolog = await callGeminiAPI(prompt);
        res.json({ prolog });
    } catch (error) {
        console.error('プロローグ生成エラー:', error);
        res.status(500).json({ error: error.message });
    }
});

// 完成版小説生成API
app.post('/api/generate-story', async (req, res) => {
    try {
        const { characters, setting, genre, feedback } = req.body;

        if (!characters || !setting || !genre) {
            return res.status(400).json({ error: '必要な情報が不足しています' });
        }

        const prompt = `以下の設定で4000文字の完成小説を村上春樹の文体で書いてください。

登場人物: ${characters.join('、')}
舞台: ${setting}
ジャンル: ${genre}
${feedback ? `要望: ${feedback}` : ''}

要件:
- 4000文字の完成作品
- 起承転結の構成
- 村上春樹調
- 縦書き対応
- キャラクター成長
- 感動的結末
- ジャンル特色活用

構成:
1. 導入（キャラ紹介・状況）
2. 展開（事件・関係変化）
3. クライマックス（困難・感動）
4. 結末（解決・余韻）`;

        const story = await callGeminiAPI(prompt);
        res.json({ story });
    } catch (error) {
        console.error('小説生成エラー:', error);
        res.status(500).json({ error: error.message });
    }
});

// ルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({ error: 'ページが見つかりません' });
});

// エラーハンドラー
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'サーバーエラー' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});