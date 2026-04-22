# web-voice-changer

ブラウザ上でマイク録音した音声をONNX Runtime Webで変換し、その場で再生するGitHub Pages向けのデモです。処理は完全にクライアントサイドで完結し、アプリ用サーバーは不要です。

## デモ内容

- マイク録音の開始と停止
- `MediaRecorder`で録音したBlobを`AudioContext`でデコード
- モノラル`Float32Array`波形の取得
- `/models/model.onnx`をONNX Runtime Webで推論
- 推論後の`Float32Array`波形を`AudioBuffer`に戻して再生
- 入力と出力の波形表示、録音時間、ステータス表示

初期状態の`models/model.onnx`はIdentity変換の軽量モデルです。録音から推論、再生までの配線確認用なので、実際の音声変換を行う場合は同じ入出力形式の軽量モデルに差し替えてください。

## 技術スタック

- Vite + Vanilla JavaScript
- Web Audio API
- `MediaDevices.getUserMedia`
- `MediaRecorder`
- `onnxruntime-web`
- WebGPU優先、WASM fallback

## セットアップ

```bash
npm install
npm run dev
```

Viteの表示するローカルURLをブラウザで開きます。マイク利用にはブラウザの許可が必要です。

## ビルド

```bash
npm run build
```

`dist/`に静的ファイルが生成されます。`vite.config.js`で`base: './'`にしているため、GitHub Pagesのプロジェクトページ配下でも相対パスで動作します。`models/`はビルド時に`dist/models/`へコピーされ、ONNX Runtime Webが必要とするWASM assetはViteのバンドル処理で出力されます。

## GitHub Pagesデプロイ

`.github/workflows/deploy.yml` を追加済みです。`main` への push または手動実行で `npm ci` -> `npm run build` を行い、`dist/` を Pages artifact としてデプロイします。

1. GitHub の **Settings > Pages** で **Source: GitHub Actions** を選びます。
2. `main` に push するか、Actions から `Deploy to GitHub Pages` を手動実行します。
3. workflow 完了後、GitHub Pages の公開 URL で `index.html` と `models/model.onnx` を確認します。

## Playwright smoke test

```bash
npm run test:e2e
```

既定では `http://127.0.0.1:5178/` を確認します。別 URL を使う場合は `PLAYWRIGHT_URL` を指定してください。

```powershell
$env:PLAYWRIGHT_URL="http://127.0.0.1:4190/"
npm run test:e2e
```

## モデル差し替え

`models/model.onnx`を実際の音声変換モデルに置き換えます。

- 入力: `float32` mono waveform
- 出力: `float32` waveform
- 推奨サイズ: 50MB以下

既定の推論アダプタは `src/modelProfile.js` にあります。現在の Identity モデル向け profile は以下を担当します。

- 入力名と出力名の解決
- 入力 shape の解決
- 推論前 `preprocess`
- 推論後 `postprocess`

デフォルトではモデルの最初の入力名と最初の出力名を使い、入力 shape はメタデータがあればそれに合わせ、動的次元は最後の次元をサンプル数、それ以外を `1` として扱います。実モデルへ差し替える場合は `expectedSampleRate`、`inputName`、`outputName`、`preprocess`、`postprocess` などを profile 側で調整してください。
