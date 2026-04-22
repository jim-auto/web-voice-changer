# web-voice-changer 引き継ぎ計画

更新日: 2026-04-22  
引き継ぎ先: GitHub Copilot / 次の開発担当  
目的: GitHub Pagesで動作する、完全クライアントサイドのブラウザ音声変換デモを完成させる。

## 1. プロジェクトの目的

このリポジトリは、ブラウザ上でマイク録音した音声をONNX Runtime Webで変換し、すぐに再生できるデモアプリです。

最終ゴールは以下です。

- サーバー不要の完全クライアントサイド実行
- GitHub Pagesに静的ファイルとして公開可能
- マイク録音から`Float32Array`波形取得までできる
- `/models/model.onnx`のONNXモデルで音声変換できる
- 変換後の`Float32Array`を`AudioBuffer`に戻して再生できる
- WebGPUが使える場合はWebGPUを優先し、使えない場合はWASMにfallbackする

現在は、まず「録音 -> ONNX推論 -> 再生」の配線確認を優先した段階です。実際に声色を変える本物の音声変換モデルはまだ入っていません。

## 2. 現在の実装状況

現在の主要ファイルは以下です。

```text
web-voice-changer/
├── index.html
├── src/
│   ├── main.js
│   ├── audio.js
│   ├── inference.js
│   └── styles.css
├── scripts/
│   ├── create-identity-model.mjs
│   └── playwright-smoke.mjs
├── models/
│   └── model.onnx
├── vite.config.js
├── package.json
├── package-lock.json
├── README.md
└── PLAN.md
```

### 2.1 `src/main.js`

UI制御を担当しています。

実装済み:

- `Record`ボタン
- `Stop`ボタン
- status表示
  - `idle`
  - `recording`
  - `processing`
  - `done`
  - `error`
- 録音時間表示
- sample rate表示
- duration表示
- ONNX実行engine表示
- input/output波形Canvas描画
- 録音停止後に自動で変換と再生

重要な流れ:

```text
Record click
  -> AudioRecorder.start()
  -> status: recording

Stop click
  -> AudioRecorder.stop()
  -> Float32Array取得
  -> VoiceChanger.convert()
  -> output波形描画
  -> status: done
  -> playFloat32Audio()
```

### 2.2 `src/audio.js`

録音、デコード、モノラル化、再生、波形描画を担当しています。

実装済み:

- `navigator.mediaDevices.getUserMedia()`
- `MediaRecorder`
- 録音Blob取得
- Blob -> ArrayBuffer
- `AudioContext.decodeAudioData()`
- `AudioBuffer` -> mono `Float32Array`
- stereo/multi-channel入力の平均mono化
- `Float32Array` -> `AudioBuffer`
- 出力音声のclamp
- Canvas波形描画
- `MediaRecorder`未対応時のエラー
- Web Audio API未対応時のエラー

現状の前提:

- まずはmono対応のみ
- リアルタイム処理はしない
- 録音後のバッチ変換のみ

### 2.3 `src/inference.js`

ONNX Runtime Webのロードと推論を担当しています。

実装済み:

- モデルURL: `models/model.onnx`
- `navigator.gpu`があれば`onnxruntime-web/webgpu`を試す
- WebGPUが使えない場合は`onnxruntime-web`のWASMを使う
- どちらも失敗した場合はpassthroughにfallback
- モデルの最初の入力名と最初の出力名を使用
- 動的shapeの簡易解決
- 出力tensorを`Float32Array`へ変換

現在のモデルcontract:

```text
input:  float32 mono waveform
output: float32 waveform
```

ただし、実モデル導入時にはこのcontractを必ず再確認してください。

### 2.4 `models/model.onnx`

現在は本物の音声変換モデルではありません。配線確認用のIdentityモデルです。

役割:

- 入力波形をそのまま出力する
- ONNX Runtime Webのロード確認に使う
- 録音 -> 推論 -> 再生のend-to-end確認に使う

生成元:

```text
scripts/create-identity-model.mjs
```

再生成コマンド:

```bash
node scripts/create-identity-model.mjs
```

### 2.5 `scripts/playwright-smoke.mjs`

Playwrightによる簡易E2E確認スクリプトです。

確認内容:

- ページが表示される
- fake microphoneで録音開始できる
- statusが`recording`になる
- Stop後にONNX推論が走る
- statusが`done`になる
- 入力/出力Canvasに波形が描画される
- `models/model.onnx`がHTTP 200で取得できる
- WASM assetがHTTP 200で取得できる
- page errorがない

実行:

```bash
npm run test:e2e
```

デフォルトURL:

```text
http://127.0.0.1:5178/
```

別URLで実行:

```powershell
$env:PLAYWRIGHT_URL="http://127.0.0.1:4180/"
npm run test:e2e
```

## 3. 検証済み事項

### 3.1 インストール

実行済み:

```bash
npm install
```

結果:

- 成功
- 脆弱性なし

### 3.2 ビルド

実行済み:

```bash
npm run build
```

結果:

- 成功
- `dist/`生成確認済み
- `dist/models/model.onnx`生成確認済み
- ONNX Runtime WebのWASM assetが`dist/assets/`へ出力されることを確認済み

### 3.3 ONNX Identityモデル確認

Node上で`onnxruntime-web`のWASM実行により、`models/model.onnx`が読めることを確認済みです。

確認結果:

```text
input output 0.10000000149011612,-0.20000000298023224,0.30000001192092896
```

### 3.4 Vite dev serverでのPlaywright確認

確認URL:

```text
http://127.0.0.1:5178/
```

結果:

```text
ok: true
status: done
engine: wasm
sampleRate: 48,000 Hz
duration: 1.32 s
message: ""
recordDisabled: false
stopDisabled: true
model.onnx: 200
wasm assets: 200
pageErrors: []
```

Headless ChromiumではWebGPU adapterが取れず、以下のwarningが出ます。

```text
warning: No available adapters.
```

ただしWASM fallbackで正常完了しているため、これは現状では問題ありません。

### 3.5 `dist` previewでのPlaywright確認

GitHub Pagesに近い静的配信状態でも確認済みです。

確認URL例:

```text
http://127.0.0.1:4180/
```

結果:

```text
ok: true
status: done
engine: wasm
sampleRate: 48,000 Hz
duration: 1.32 s
message: ""
recordDisabled: false
stopDisabled: true
model.onnx: 200
wasm assets: 200
pageErrors: []
```

## 4. 現在の開発サーバー

最後に確認したdev server:

```text
http://127.0.0.1:5178/
```

プロセスID:

```text
29172
```

停止する場合:

```powershell
Stop-Process -Id 29172
```

注意:

- `5173`から`5177`も別プロセスがlistenしていました。
- 既存プロセスはユーザー作業の可能性があるため、勝手に止めないでください。
- このプロジェクト用に新しく起動する場合は、空いているポートを使ってください。

## 5. 設計上の決定

### 5.1 まずはIdentityモデルで進める

最初から本物の音声変換モデルを入れると、以下の問題が同時に発生しやすくなります。

- モデル入出力shape不一致
- sample rate不一致
- 推論時間が長い
- ブラウザメモリ不足
- WebGPU/WASM差異
- 音声前処理/後処理の不足

そのため、現在はIdentityモデルで配線を固めています。

この判断により、現在すでに以下は確認できています。

- マイク録音
- Blob decode
- mono `Float32Array`抽出
- ONNXモデルロード
- ONNX Runtime Web推論
- WASM fallback
- `Float32Array`再生
- GitHub Pages向け静的build

### 5.2 Viteの`base`は`./`

`vite.config.js`では以下を設定しています。

```js
base: './'
```

理由:

- GitHub Pagesのproject page配下で動かすため
- 例: `https://user.github.io/web-voice-changer/`
- assetやmodel参照を相対パスで解決するため

### 5.3 `models/`はVite publicではなく独自コピー

現在は`models/`をrepo rootに置き、`vite.config.js`のpluginで以下を行っています。

- dev serverで`/models/...`を配信
- build後に`dist/models/...`へコピー

理由:

- 要件の構成に合わせるため
- モデルファイルを`/models/model.onnx`として扱いたいため

### 5.4 WASM assetはViteに任せる

ONNX Runtime WebのWASM pathを手動指定する実装は外しました。

理由:

- Viteが`onnxruntime-web`のdynamic importに必要なWASM assetを`dist/assets/`へ出力してくれる
- 手動`wasmPaths`指定はNode/Vite/browser間でパス解決が崩れやすい

現在は以下のように動いています。

- dev: `node_modules/onnxruntime-web/dist/...wasm`を取得
- dist preview: `assets/...wasm`を取得

## 6. まだ未実装の重要項目

### 6.1 本物の音声変換モデル

最重要の未実装です。

現在の`models/model.onnx`はIdentityモデルなので声は変わりません。

次に必要なこと:

1. 軽量な音声変換ONNXモデルを用意する
2. `models/model.onnx`に配置する
3. 入力shape、出力shape、sample rate、前処理、後処理を確認する
4. `src/inference.js`をモデル仕様に合わせる
5. ブラウザで推論時間とメモリ使用量を確認する

モデル選定時の条件:

- 50MB以下を目安
- ブラウザWASMで現実的な速度
- 可能ならWebGPU対応時に高速化できる構造
- 入力はmono waveformか、それに変換しやすい形式
- 出力はwaveformか、それに変換しやすい形式

### 6.2 sample rate変換

現在は録音された`AudioBuffer.sampleRate`をそのまま使っています。

Playwright fake micでは48kHzでした。

実モデルが以下のような固定sample rateを要求する場合、resamplingが必要です。

- 16kHz
- 24kHz
- 32kHz
- 44.1kHz
- 48kHz

次に追加すべき候補:

- `src/audio.js`にresample関数を追加
- `OfflineAudioContext`を使ったresampling
- モデル入力用sample rateと再生用sample rateを分けて管理

受け入れ条件:

- モデルが16kHz固定でも録音音声を正しく推論できる
- 出力をブラウザで自然に再生できる
- READMEにモデル要求sample rateを明記する

### 6.3 モデル入出力shape対応

現在のshape処理は簡易です。

想定できる入力shape:

```text
[samples]
[1, samples]
[1, 1, samples]
[batch, channels, samples]
```

本物のモデルがmel spectrogramやspeaker embeddingを要求する場合、現在の実装だけでは動きません。

次にやること:

- 実モデルのNetron確認
- input names確認
- output names確認
- dimensions確認
- dtype確認
- 前処理の有無確認

`src/inference.js`の拡張案:

```text
model profile / adapterを作る
  - inputName
  - outputName
  - expectedSampleRate
  - inputShape strategy
  - preprocess(samples)
  - postprocess(outputs)
```

### 6.4 GitHub Pages自動デプロイ

まだGitHub Actions workflowはありません。

次に追加する推奨ファイル:

```text
.github/workflows/deploy.yml
```

想定workflow:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

受け入れ条件:

- main pushでPagesへdeployされる
- GitHub Actionsが成功する
- 公開URLで`models/model.onnx`が200
- 公開URLで録音から再生まで動作する

### 6.5 公開URLでのE2E

GitHub Pages公開後、以下で確認してください。

```powershell
$env:PLAYWRIGHT_URL="https://<user-or-org>.github.io/web-voice-changer/"
npm run test:e2e
```

注意:

- GitHub PagesはHTTPSなのでマイク利用可能
- ブラウザ権限の挙動はheadlessと手動確認で差がある可能性あり
- 最終的には手動で実マイク確認も必要

## 7. Copilotに渡す次タスク案

### Task A: GitHub Pages workflowを追加する

優先度: 高  
理由: 現在の静的buildは通っているため、公開まで進められる。

作業:

- `.github/workflows/deploy.yml`を追加
- `npm ci`
- `npm run build`
- `dist/`をPages artifactとしてupload
- deploy-pagesで公開

受け入れ条件:

- workflow構文が正しい
- GitHub Actionsでbuild成功
- Pages公開URLで`index.html`が表示される
- `/models/model.onnx`が200

### Task B: 実モデル差し替え用adapter設計を追加する

優先度: 高  
理由: 本物のモデル導入時に`inference.js`へ直接分岐を増やすと壊れやすい。

作業案:

- `src/modelProfile.js`を追加
- デフォルトprofileは現在のIdentityモデルに合わせる
- profileに以下を持たせる
  - `expectedSampleRate`
  - `inputShape`
  - `preprocess`
  - `postprocess`
  - `inputName` override
  - `outputName` override

受け入れ条件:

- Identityモデルの挙動が変わらない
- `npm run build`成功
- `npm run test:e2e`成功

### Task C: sample rate変換を追加する

優先度: 中  
理由: 多くの音声モデルは16kHzや24kHz固定のため。

作業案:

- `src/audio.js`に`resampleFloat32(samples, fromRate, toRate)`を追加
- まずは`OfflineAudioContext`で実装
- profileの`expectedSampleRate`が録音sample rateと違う場合に推論前resample
- 必要なら推論後に再生sample rateへ戻す

受け入れ条件:

- 48kHz録音を16kHz推論入力にできる
- 出力音声を再生できる
- Playwright smoke testが壊れない

### Task D: UIにmodel状態をもう少し出す

優先度: 中  
理由: WebGPU/WASM/passthroughの違いがユーザーに見えないとデバッグしにくい。

作業案:

- engine表示は既にあるので、warning表示を少し整理
- passthrough時は「model fallback / passthrough」を明示
- ONNX load中のstatusを分けるなら`loading model`を追加

受け入れ条件:

- ONNX失敗時にUI上で理由が読める
- 通常成功時はノイズの多い文言を出さない

### Task E: READMEを公開後URL向けに更新する

優先度: 中  
理由: Copilotや利用者が手順を追いやすくなる。

作業案:

- GitHub Pages URLを追加
- workflow追加後のdeploy手順を具体化
- 実モデル差し替え時の注意を増やす
- Playwright smoke testの実行方法を追記

受け入れ条件:

- 初見で`npm install`から`npm run dev`まで進められる
- GitHub Pages公開手順がREADMEだけで分かる
- Identityモデルであることが明確

## 8. 実モデル導入時の確認チェックリスト

本物の`models/model.onnx`を入れる前に確認してください。

- [ ] モデルサイズは50MB以下か
- [ ] ONNX opsetはONNX Runtime Webで対応可能か
- [ ] 入力dtypeは`float32`か
- [ ] 入力shapeは何か
- [ ] 出力dtypeは`float32`か
- [ ] 出力shapeは何か
- [ ] 入力sample rateは何Hzか
- [ ] 出力sample rateは何Hzか
- [ ] waveformを直接入力するモデルか
- [ ] spectrogramなどの前処理が必要か
- [ ] speaker id / speaker embedding / pitch / f0など追加入力が必要か
- [ ] 出力をそのまま再生できるか
- [ ] 出力振幅は`[-1, 1]`想定か
- [ ] 推論時間は許容範囲か
- [ ] WASMで動くか
- [ ] WebGPUで動くか

追加入力が必要なモデルの場合、現在のUI/推論コードだけでは不足します。

## 9. 既知のリスク

### 9.1 WebGPUは必ず使えるわけではない

Headless Chromiumでは以下が出ました。

```text
warning: No available adapters.
```

ただしWASM fallbackは正常です。

ブラウザやOS、GPU設定によってWebGPUは使えないことがあります。WebGPU前提の体験にしないでください。

### 9.2 MediaRecorderの形式差

ブラウザによって`MediaRecorder`の対応mime typeが違います。

現在は以下の優先順で選択しています。

```text
audio/webm;codecs=opus
audio/webm
audio/mp4
audio/ogg;codecs=opus
```

Safari対応を強める場合は、実機確認が必要です。

### 9.3 大きいモデルはGitHub Pagesでも重い

50MB以下を目安にしていますが、実際には以下に注意が必要です。

- 初回ロード時間
- モバイル回線
- ブラウザメモリ
- WASM初期化時間
- 推論時間

モデルを入れたらNetwork tabでロード時間を確認してください。

### 9.4 音量とクリッピング

現在は再生前に`[-1, 1]`へclampしています。

本物のモデル出力が極端に小さい/大きい場合は、以下が必要です。

- normalize
- gain調整
- limiter
- DC offset除去

### 9.5 Playwrightのfake micは実音声品質確認ではない

Playwright smoke testは配線確認には有効ですが、実マイク音声の品質確認ではありません。

本番前に必ず手動で確認してください。

## 10. 推奨する次の順番

次の担当者は、以下の順で進めるのが安全です。

1. 現状をcommitする
2. GitHub Pages workflowを追加する
3. GitHub PagesでIdentityモデルのまま公開確認する
4. 公開URLでPlaywright smoke testを実行する
5. 実マイクで手動確認する
6. 本物のONNXモデル候補を決める
7. Netronでモデル入出力を確認する
8. `src/inference.js`またはmodel adapterを調整する
9. sample rate変換を追加する
10. 実モデルでPlaywrightと手動確認をする
11. READMEを公開URLとモデル仕様に合わせて更新する

## 11. コマンド一覧

依存関係インストール:

```bash
npm install
```

開発サーバー:

```bash
npm run dev
```

ビルド:

```bash
npm run build
```

preview:

```bash
npm run preview
```

Playwright smoke test:

```bash
npm run test:e2e
```

別URLでsmoke test:

```powershell
$env:PLAYWRIGHT_URL="http://127.0.0.1:4180/"
npm run test:e2e
```

Identityモデル再生成:

```bash
node scripts/create-identity-model.mjs
```

## 12. Copilot向け短い依頼文

Copilotにそのまま渡すなら、以下のような依頼が使えます。

```text
このリポジトリはVite + Vanilla JSの完全クライアントサイド音声変換デモです。
現在はIdentity ONNXモデルで、録音 -> ONNX Runtime Web推論 -> 再生までPlaywright確認済みです。
まずGitHub Pages用の.github/workflows/deploy.ymlを追加してください。
その後、実ONNXモデル差し替えに備えてsrc/inference.jsをmodel profile/adapter方式に整理してください。
既存のIdentityモデルの挙動、npm run build、npm run test:e2eは壊さないでください。
詳細はPLAN.mdを参照してください。
```

## 13. 現時点の結論

現在のリポジトリは、デモの土台としては動作しています。

できていること:

- 録音
- デコード
- mono `Float32Array`取得
- ONNX Runtime Web推論
- WASM fallback
- 再生
- 波形表示
- build
- Playwright smoke test
- 静的preview確認

まだ必要なこと:

- GitHub Pages自動デプロイ
- 本物の音声変換ONNXモデル
- 実モデルに合わせた前処理/後処理
- sample rate変換
- 公開URLでの確認
- 実マイクでの手動品質確認
