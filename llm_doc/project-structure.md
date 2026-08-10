# プロジェクト構造

## ディレクトリ構成
```
manga-editor-desu/
├── index.html          メインHTML（script/CSS読み込み順が重要）
├── js/
│   ├── core/           基盤（logger, settings, auto-save, compression, font, util）
│   ├── fabric/         fabric.js Canvas管理（fabric-management.js）
│   ├── layer/          レイヤー管理（layer-management.js, blend, floating-window）
│   ├── ui/             UI部品（toast, overlay, control, event-delegator, prompt-manager）
│   │   ├── preset-picker.js  一覧から1件選ぶポップアップ
│   │   └── preset-panel.js   ペン/トーン/画像テキストの「今のプリセット」カード定義
│   │   └── control/object-control-sync.js  選択オブジェクト値の各パネルへの反映
│   ├── sidebar/        サイドバーツール
│   │   ├── pen/        ブラシ（crayon, ink, marker, spray, drip, stroke）
│   │   ├── text/       テキスト（vertical-text, 画像テキスト31種）
│   │   │   ├── text-2-manager.js  画像テキストの入口。種類→処理の対応表を持つ
│   │   │   └── custom/
│   │   │       ├── generic-text-effect.js   表からSVGを組み立てる汎用ドライバ
│   │   │       ├── text-effect-presets.js   種類定義22件（ここに1件足せば増える）
│   │   │       ├── custom-text-util.js      文字組み・採寸・配置の共通処理
│   │   │       └── optimized-*-text.js      1種類1ファイルの旧実装9種
│   │   ├── speechBubble/ 吹き出し
│   │   ├── tone/       トーン（speedline, focusline, snow, noise）
│   │   ├── effect/     エフェクト（c2bw, c2c, effect-batch）
│   │   └── panel/      コマ割り（panel-manager, knife/）
│   ├── ai/             AI生成系（→ ai-system.md参照）
│   │   ├── prompt/llm/llm-story-*.js  ストーリー→コマのプロンプト（プロンプトパネル）
│   │   ├── prompt/panel-composition.js 役割→構図タグの表とSDXLバケット
│   │   └── prompt/prompt-apply.js     コマへの書き込みとページ送り
│   ├── db/             永続化（user-font-repository）
│   ├── dashboard/      ダッシュボード（統計、プロンプト頻度、外部API利用料）
│   ├── svg/            SVGテンプレート（コマ割り、吹き出し）
│   ├── core/font/project-font.js  プロジェクトのフォント情報保存・復元
│   ├── canvas-manager.js    キャンバスリサイズ・ズーム、原稿サイズ(mm)
│   ├── project-management.js プロジェクト保存/読み込み
│   └── shortcut.js     キーボードショートカット
├── css/
│   ├── root.css        CSS変数（カラー、z-index）
│   ├── layout.css      メインレイアウト
│   ├── layout-layer.css レイヤーパネル
│   ├── components.css  共通コンポーネント
│   ├── form.css        フォーム
│   ├── responsive.css  レスポンシブ
│   └── ui/             機能別CSS
├── html/               HTMLテンプレート
│   ├── common.css      静的ページ共通スタイル（外部依存なし。新規静的ページはこれを使う）
│   ├── functionList.html 機能一覧（JS描画。noindex。正典は html/docs/features*.html）
│   └── docs/           AI検索・SEO向けの静的ドキュメント（JSなしで本文が読める）
│       ├── features.html / features-ja.html    機能リファレンス（TechArticle）
│       ├── faq.html / faq-ja.html              よくある質問（FAQPage）
│       └── ai-setup.html / ai-setup-ja.html    AIバックエンド設定（HowTo）
├── robots.txt          クローラー制御（※このファイル自体は未適用。実体は別リポジトリ。下記参照）
├── sitemap.xml         サイトマップ（hreflangでEN/JA対応付け）
├── llms.txt            AI検索向けの要約索引。数値を変更したらここも直す
├── llm_doc/            LLM向けドキュメント
└── scripts/            ユーティリティスクリプト（format, translation check）
```

## 公開・クローラー関連の注意
- `index.html`の`<head>`は49行目付近の`<div id="a">`で強制終了していたため、`</head>`を明示済み。**metaタグは必ず`</head>`より前に置く**（後ろに置くとbody扱いで無視される）
- `robots.txt`はドメイン直下（`new-sankaku.github.io/robots.txt`）でないとクローラーが読まない。**実際に効いているのは別リポジトリ [`new-sankaku/new-sankaku.github.io`](https://github.com/new-sankaku/new-sankaku.github.io) の`robots.txt`**。本リポジトリ直下の`robots.txt`は`/manga-editor-desu/robots.txt`として配信されるだけで無効（カスタムドメインを付けた場合に備えて内容は同期させておく）。ページ単位の制御は各HTMLの`<meta name="robots">`で行う
- `service-worker.js`のキャッシュ戦略は3系統。**ドキュメント（`.html`とnavigationリクエスト）はstale-while-revalidate** — キャッシュを即返しつつ裏で更新するため、`CACHE_VERSION`を上げなくても次回読み込みで新しいHTMLが反映される。`.css`/`.js`等はキャッシュ優先（URLの`?v=x.y`で更新する前提）。`.txt`/`.xml`は対象外で常にネットワーク優先なので`robots.txt`/`sitemap.xml`/`llms.txt`は常に最新が配信される
- 機能の数量（コマ69・フキダシ48・フォント156・画像テキスト31・8言語・AI 6種）を変更したら、`llms.txt`・`html/docs/*`・`index.html`のJSON-LD`featureList`・`README*.md`・`html/functionList.html`をまとめて更新する

## 主要グローバル変数
| 変数 | 説明 |
|------|------|
| `canvas` | fabric.js Canvasインスタンス |
| `stateStack` / `currentStateIndex` | Undo/Redo履歴 |
| `ModeManager` | 操作モード管理（SELECT, FREEHAND, KNIFE, PEN等） |
| `providerRegistry` | AIプロバイダ登録・ロール割り当て |
| `aiTaskMap` | AI生成タスク状態（generation-task-manager.js） |
| `sdQueue` / `comfyuiQueue` / `runpodEndpointQueue` / `falaiQueue` | プロバイダ別TaskQueue |

## Canvas初期化
```javascript
new fabric.Canvas("mangaImageCanvas",{
  enableRetinaScaling:true,
  renderOnAddRemove:false,
  renderer:fabric.isWebglSupported?"webgl":"canvas"
});
```
- 最小サイズ: 600x400
- `blendScale=3`（fabric→HTMLキャンバス変換倍率）

## モジュール間通信
1. **DOM Events** - `addEventListener`/`dispatchEvent`
2. **fabric.js Canvas Events** - `canvas.on('selection:created')`等
3. **EventDelegator** - `data-action`属性によるクリック委譲
4. **グローバル変数** - `canvas`, `stateStack`, `ModeManager`等

## script読み込み順（index.html）
1. サードパーティ（fabric.js, i18next, hotkeys等）
2. core（logger, settings, error handler）
3. fabric管理
4. UI（toast, overlay, mode管理）
5. プロジェクト・キャンバス管理
6. レイヤー
7. サイドバーツール
8. AI系
9. auto-save, compression
10. font, service worker
