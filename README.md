# Symbol Service library

## ビルド

```shell
yarn
yarn build
```

## テスト

`dot.env.test` を編集して `.env.test` にリネームする。

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
