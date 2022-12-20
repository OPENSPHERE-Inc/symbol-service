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

## 2. Logger ネームスペース

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
