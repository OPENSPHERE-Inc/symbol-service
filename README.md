# Symbol Service library

Symbol ブロックチェーン用の簡易ライブラリです。

内部的には Symbol SDK を使用します。

## 1. SymbolService クラス

### コンストラクタ

```typescript
const config: SymbolServiceConfig = {
    node_url: "https://example.jp:3001",
    fee_ratio: 0.0,
    deadline_hours: 5,
    batch_size: 100,
    max_parallels: 10,
    repo_factory_config: repoFactoryConfig as RepositoryFactoryConfig,
    repo_factory: repoFactory as RepositoryFactoryHttp,
};

const symbolService = new SymbolService(config)
```

**引数**

- `config: SymbolServiceConfig`
    - `node_url: string` - (Required) ノードURL
    - `fee_ratio: number` - **(Optional)** トランザクション手数料率 (0.0 ～ 1.0, デフォルト 0.0）
    - `deadline_hours: number` - **(Optional)** トランザクション有効期限（デフォルト 5 時間）
    - `batch_size: number` - **(Optional)** Aggregate インナートランザクション最大数（デフォルト 100）
    - `max_parallels: number` - **(Optional)** トランザクションアナウンス並列数（デフォルト 10）
    - `repo_factory_config: RepositoryFactoryConfig` - **(Optional)** Symbol SDK の RepositoryFactoryHttp コンストラクタに渡すコンフィグ
    - `repo_factory: RepositoryFactoryHttp` - **(Optional)** RepositoryFactoryHttp インスタンスそのもの

## 2. NecromancyService クラス

[Aggregate Undead Transaction](https://github.com/OPENSPHERE-Inc/aggregate-undead-poc) を取り扱うクラス

### コンストラクタ

```typescript
const config: NecromancyServiceConfig = {
  deadlineUnitHours: 5,
  deadlineMarginHours: 1,    
};

const necromancyService = new NecromancyService(symbolService, config);
```

**引数**

- `symbolService: SymbolService` - SymbolService インスタンス
- `config: NecromancyServiceConfig` - 任意指定
  - `deadlineUnitHours: number` - **(Optional)** Deadline を時分割する際の単位あたりの時間 (default:5)
  - `deadlineMarginHours: number` - **(Optional)** Pick する際に持たせる余裕時間。
    deadlineUnitHours + deadlineMarginHours がネットワークの制限を超えない事 (default:1)

## 3. NodeTracker クラス

### コンストラクタ

```typescript
const options: NodeTrackerServiceOptions = {
  cachedNodes: [] as NodeStatistics,
  cacheTimestamp: 12345678,
  noWebSocketChallenge: false,
  webSocketTimeout: 60000,
  maxParallels: 10,
};

const nodeTracker = new NodeTrackerService(statsServiceURL, networkType, options);
```

**引数**

- `statsServiceURL: string` -　Symbol Statistics Service の URL。Testnet: `https://testnet.symbol.services/nodes`, Mainnet: `https://symbol.services/nodes`
- `networkType: NetworkType` - Testnet: `152`, Mainnet: `104`
- `option: NodeTrackerServiceOptions` - (Optional)
  - `cachedNodes: NodeStatistics[]` - (Optional) `availableNodes` をローカルキャッシュしていた場合はここで渡す
  - `cacheTimestamp: number` - (Optional) ローカルキャッシュ作成日時（Unix時間ミリ秒）
  - `noWebSocketChallenge: boolean` - (Optional) WebSocket 接続のチェックを行わない（その分高速）。デフォルトは `false`
  - `webSocketTimeout: number` - (Optional) WebSocket 接続のタイムアウト時間をミリ秒で指定。デフォルトは `60` 秒
  - `maxParallels: number` - (Optional) ヘルスチェックの同時実行数。デフォルトは `10`。
    値を大きくするとヘルスチェックがスピードアップしますが、やりすぎると接続エラーが頻発する場合があります。
    試した限りだと `50` 位が限度かもしれません。

## 4. Logger ネームスペース

### 初期化

```typescript
const config = {
  log_level: Logger.LogLevel.INFO,
  force_stderr: false,
}

Logger.init(config);
```

**引数**

- `config` - 任意指定
  - `log_level: Logger.LogLevel` - **(Optional)** ログレベル（指定したレベル以上のログが出力）
    - `Logger.LogLevel.DEBUG` - 全てのログ
    - `Logger.LogLevel.INFO` - `info` 以上（デフォルト）
    - `Logger.LogLevel.WARN` - `warn` 以上
    - `Logger.LogLevel.ERROR` - `error` のみ
    - `Logger.LogLevel.NONE` - ログ出力無し
  - `force_stderr: boolean` - **(Optional)** 全ログの出力先を stderr に強制する（デフォルト false）

## ビルド

```shell
yarn
yarn build
```

## テスト

`dot.env.test` を編集して `.env.test` にリネームする。

ブロックチェーンにアクセスします。

```dotenv
NODE_URL=Replace your node URL

SIGNER1_PRIVATE_KEY=Replace your private key
PAYER_PRIVATE_KEY=Replace your private key

BATCH_SIZE=100
FEE_RATIO=0.35
MAX_PARALLELS=10
```

```shell
yarn test
```

## ライセンス

MIT ライセンスです。
