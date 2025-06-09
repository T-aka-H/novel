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

// リクエストログ追加
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Request body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Gemini API呼び出し関数（修正版）
async function callGeminiAPI(prompt) {
    console.log('🤖 Gemini API呼び出し開始...');
    console.log('📝 プロンプト長:', prompt.length);
    
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }

        // APIエンドポイントURL
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        // リクエストボディ
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

        console.log('📡 Gemini API リクエスト送信中...');
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'NovelGenerator/1.0'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('📨 API応答ステータス:', response.status);
        console.log('📨 API応答ヘッダー:', Object.fromEntries(response.headers));

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                console.error('❌ Gemini API エラー詳細:', errorData);
                
                if (errorData.error) {
                    errorMessage = errorData.error.message || errorData.error.status || errorMessage;
                }
            } catch (parseError) {
                console.error('❌ エラーレスポンスのパース失敗:', parseError);
                const errorText = await response.text();
                console.error('❌ エラーレスポンステキスト:', errorText);
            }
            
            // ステータスコード別のエラーハンドリング
            switch (response.status) {
                case 400:
                    throw new Error(`リクエスト形式エラー: ${errorMessage}`);
                case 401:
                    throw new Error(`認証エラー: APIキーが無効です`);
                case 403:
                    throw new Error(`アクセス拒否: API利用権限がありません`);
                case 429:
                    throw new Error(`レート制限: APIの利用回数上限に達しました`);
                case 500:
                    throw new Error(`Gemini APIサーバーエラー: ${errorMessage}`);
                default:
                    throw new Error(`API呼び出しエラー (${response.status}): ${errorMessage}`);
            }
        }

        const data = await response.json();
        console.log('✅ API応答受信成功');
        
        // レスポンス構造の詳細チェック
        if (!data) {
            throw new Error('API応答が空です');
        }
        
        if (!data.candidates) {
            console.error('❌ candidates がありません:', data);
            throw new Error('AI応答の形式が正しくありません（candidates不在）');
        }
        
        if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
            console.error('❌ candidates が空です:', data.candidates);
            throw new Error('AI応答が生成されませんでした');
        }

        const candidate = data.candidates[0];
        if (!candidate) {
            throw new Error('AI応答の最初の候補が空です');
        }

        // finishReasonをチェック
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            console.warn('⚠️ 異常な終了理由:', candidate.finishReason);
            if (candidate.finishReason === 'SAFETY') {
                throw new Error('安全性フィルターによりコンテンツが生成されませんでした');
            } else if (candidate.finishReason === 'MAX_TOKENS') {
                console.warn('⚠️ トークン数上限に達しました');
            }
        }

        if (!candidate.content) {
            console.error('❌ content がありません:', candidate);
            throw new Error('AI応答にコンテンツが含まれていません');
        }

        if (!candidate.content.parts || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) {
            console.error('❌ content.parts がありません:', candidate.content);
            throw new Error('AI応答のパーツが空です');
        }

        const generatedText = candidate.content.parts[0].text;
        
        if (!generatedText) {
            console.error('❌ テキストが空です:', candidate.content.parts[0]);
            throw new Error('生成されたテキストが空です');
        }

        console.log('✅ テキスト生成成功! 長さ:', generatedText.length);
        console.log('📝 生成テキスト（先頭100文字）:', generatedText.substring(0, 100) + '...');
        
        return generatedText.trim();

    } catch (error) {
        console.error('❌ Gemini API 呼び出しエラー:', error);
        
        // ネットワークエラーかAPIエラーかを判別
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('ネットワーク接続エラーが発生しました');
        }
        
        // 既知のエラーはそのまま再投げ
        if (error.message.includes('認証エラー') || 
            error.message.includes('レート制限') || 
            error.message.includes('安全性フィルター')) {
            throw error;
        }
        
        // その他のエラー
        throw new Error(`AI生成エラー: ${error.message}`);
    }
}

// プロローグ生成API（修正版）
app.post('/api/generate-prolog', async (req, res) => {
    console.log('📖 プロローグ生成リクエスト受信');
    
    try {
        const { characters, setting, genre } = req.body;

        // 入力値の詳細検証
        console.log('🔍 入力値検証中...');
        
        if (!characters) {
            console.log('❌ characters が未定義');
            return res.status(400).json({ error: '登場人物が指定されていません' });
        }
        
        if (!Array.isArray(characters)) {
            console.log('❌ characters が配列ではない:', typeof characters);
            return res.status(400).json({ error: '登場人物は配列形式で送信してください' });
        }
        
        if (characters.length !== 3) {
            console.log('❌ characters の長さが不正:', characters.length);
            return res.status(400).json({ error: `登場人物は3人である必要があります（現在: ${characters.length}人）` });
        }
        
        // 各キャラクターが有効な文字列かチェック
        for (let i = 0; i < characters.length; i++) {
            if (!characters[i] || typeof characters[i] !== 'string' || characters[i].trim().length === 0) {
                console.log(`❌ characters[${i}] が無効:`, characters[i]);
                return res.status(400).json({ error: `登場人物${i + 1}の名前を入力してください` });
            }
        }
        
        if (!setting || typeof setting !== 'string' || setting.trim().length === 0) {
            console.log('❌ setting が無効:', setting);
            return res.status(400).json({ error: '舞台設定を入力してください' });
        }
        
        if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
            console.log('❌ genre が無効:', genre);
            return res.status(400).json({ error: 'ジャンルを選択してください' });
        }

        console.log('✅ 入力値検証完了');
        console.log('👥 登場人物:', characters);
        console.log('🏛️ 舞台:', setting);
        console.log('🎭 ジャンル:', genre);

        // プロンプト作成
        const prompt = `以下の設定で400文字程度の小説プロローグを村上春樹の文体で書いてください。

## 設定
- 登場人物: ${characters.join('、')}
- 舞台: ${setting}
- ジャンル: ${genre}

## 村上春樹文体の特徴
- 現代的で洗練された文章
- 内省的で詩的な表現
- 日常的な出来事の中に不思議さを織り込む
- 「僕」や「彼」などの三人称での語り
- 少し距離感のある冷静な観察者的視点
- 音楽、食べ物、本などの具体的な固有名詞
- 繊細で美しい比喩表現
- 現代都市生活の空気感

## 要件
- 400文字程度の長さ
- 村上春樹らしい現代的で洗練された文体
- 縦書きでの表示に適した文章
- 読者の興味を引く魅力的な導入部分
- 登場人物3人の関係性や立ち位置を自然に示唆
- そのジャンルらしい雰囲気を醸成しつつ、村上春樹的な不思議さも含む
- 都市的でクールな感性

## 注意事項
- 古典的な表現（〜のでした、〜でございます）は使わない
- 現代的で自然な日本語を使用
- 村上春樹の代表作のような雰囲気を意識する
- 読者が続きを読みたくなるような魅力的な文章にする`;

        console.log('🚀 Gemini API呼び出し開始...');
        const prolog = await callGeminiAPI(prompt);
        
        console.log('✅ プロローグ生成成功!');
        res.json({ prolog: prolog });

    } catch (error) {
        console.error('❌ プロローグ生成処理エラー:', error);
        
        // エラーの種類に応じて適切なHTTPステータスとメッセージを返す
        if (error.message.includes('認証エラー') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('レート制限') || error.message.includes('利用回数上限')) {
            res.status(429).json({ error: 'API利用制限に達しました。しばらく待ってから再度お試しください。' });
        } else if (error.message.includes('安全性フィルター')) {
            res.status(400).json({ error: '入力内容に問題があります。別の設定でお試しください。' });
        } else if (error.message.includes('ネットワーク')) {
            res.status(503).json({ error: 'ネットワークエラーが発生しました。しばらく待ってから再度お試しください。' });
        } else {
            res.status(500).json({ error: 'プロローグの生成中にエラーが発生しました。もう一度お試しください。' });
        }
    }
});

// 完成版小説生成API（修正版）
app.post('/api/generate-story', async (req, res) => {
    console.log('📚 完成版小説生成リクエスト受信');
    
    try {
        const { characters, setting, genre, feedback } = req.body;

        // 入力値検証
        if (!characters || !Array.isArray(characters) || characters.length !== 3) {
            return res.status(400).json({ error: '登場人物3人が必要です' });
        }
        
        if (!setting || typeof setting !== 'string' || setting.trim().length === 0) {
            return res.status(400).json({ error: '舞台設定を入力してください' });
        }
        
        if (!genre || typeof genre !== 'string' || genre.trim().length === 0) {
            return res.status(400).json({ error: 'ジャンルを選択してください' });
        }

        console.log('✅ 完成版小説の入力値検証完了');
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

        console.log('🚀 完成版小説のGemini API呼び出し開始...');
        const story = await callGeminiAPI(prompt);
        
        console.log('✅ 完成版小説生成成功!');
        res.json({ story: story });

    } catch (error) {
        console.error('❌ 完成版小説生成処理エラー:', error);
        
        // エラーハンドリング（プロローグと同じロジック）
        if (error.message.includes('認証エラー') || error.message.includes('APIキー')) {
            res.status(503).json({ error: 'サービス設定エラーです。管理者にお問い合わせください。' });
        } else if (error.message.includes('レート制限') || error.message.includes('利用回数上限')) {
            res.status(429).json({ error: 'API利用制限に達しました。しばらく待ってから再度お試しください。' });
        } else if (error.message.includes('安全性フィルター')) {
            res.status(400).json({ error: '入力内容に問題があります。別の設定でお試しください。' });
        } else if (error.message.includes('ネットワーク')) {
            res.status(503).json({ error: 'ネットワークエラーが発生しました。しばらく待ってから再度お試しください。' });
        } else {
            res.status(500).json({ error: '小説の生成中にエラーが発生しました。もう一度お試しください。' });
        }
    }
});

// ルート
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ヘルスチェック（修正版）
app.get('/health', (req, res) => {
    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };
    
    console.log('🩺 ヘルスチェック:', healthData);
    res.json(healthData);
});

// デバッグ用エンドポイント（本番環境では削除推奨）
app.get('/debug/env', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ error: 'Not found' });
    }
    
    res.json({
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0,
        keyPrefix: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) + '...' : 'N/A',
        nodeEnv: process.env.NODE_ENV,
        port: PORT
    });
});

// 404ハンドラー
app.use((req, res) => {
    console.log('❌ 404 - ページが見つかりません:', req.path);
    res.status(404).json({ error: 'ページが見つかりません' });
});

// グローバルエラーハンドラー
app.use((err, req, res, next) => {
    console.error('❌ グローバルエラー:', err);
    console.error('❌ スタックトレース:', err.stack);
    
    // エラー詳細をログに記録
    console.error('❌ リクエスト情報:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
    });
    
    res.status(500).json({ 
        error: 'サーバー内部エラーが発生しました',
        timestamp: new Date().toISOString()
    });
});

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 サーバー起動完了!');
    console.log(`📡 ポート: ${PORT}`);
    console.log(`🔑 Gemini APIキー: ${process.env.GEMINI_API_KEY ? '設定済み' : '未設定'}`);
    console.log(`🌍 環境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ 開始時刻: ${new Date().toISOString()}`);
});