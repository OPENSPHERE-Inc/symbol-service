import assert from "assert";
import {SignedAggregateTx, SymbolService} from "../services";
import {
    Account,
    CosignatureTransaction,
    InnerTransaction,
    NamespaceId,
    UInt64
} from "symbol-sdk";
import {v4 as uuidv4} from "uuid";
import {Logger} from "../libs";


export namespace SymbolTest {

    export let symbolService: SymbolService;

    export const init = () => {
        assert(process.env.NODE_URL);
        assert(process.env.FEE_RATIO);
        assert(process.env.BATCH_SIZE);
        assert(process.env.MAX_PARALLELS);

        Logger.init({ log_level: Logger.LogLevel.DEBUG });

        const config = {
            node_url: process.env.NODE_URL,
            fee_ratio: Number(process.env.FEE_RATIO),
            deadline_hours: 5,
            batch_size: Number(process.env.BATCH_SIZE),
            max_parallels: Number(process.env.MAX_PARALLELS),
        };
        symbolService = new SymbolService(config);

        return symbolService;
    };

    export const getNamedAccounts = async () => {
        assert(process.env.SIGNER1_PRIVATE_KEY);
        assert(process.env.PAYER_PRIVATE_KEY);

        const { networkType } = await symbolService.getNetwork();
        return {
            signerAccount: Account.createFromPrivateKey(process.env.SIGNER1_PRIVATE_KEY, networkType),
            payerAccount: Account.createFromPrivateKey(process.env.PAYER_PRIVATE_KEY, networkType),
        };
    };

    export const doAggregateTx = async (txs: InnerTransaction[], signerAccount: Account, cosignerAccounts: Account[]) => {
        const aggregateTx = await symbolService.composeAggregateCompleteTx(
            await symbolService.getFeeMultiplier(0),
            cosignerAccounts.length,
            txs
        );
        const { networkGenerationHash } = await symbolService.getNetwork();
        const signedTx = signerAccount.sign(aggregateTx, networkGenerationHash);
        const cosignatures = cosignerAccounts.map(
            (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signedTx.hash)
        );
        await symbolService.announceTxWithCosignatures(signedTx, cosignatures);
        return (await symbolService.waitTxsFor(signerAccount, signedTx.hash, "confirmed")).shift();
    };

    export const doAggregateTxBatches = async (
        txs: InnerTransaction[],
        signerAccount: Account,
        cosignerAccounts: Account[],
        batchesCreatedCallback?: (batches: SignedAggregateTx[], totalFee: UInt64) => void,
    ) => {
        const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
            txs,
            signerAccount,
            cosignerAccounts,
        );
        const totalFee = batches.reduce(
            (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
        );

        batchesCreatedCallback?.(batches, totalFee);

        return symbolService.executeBatches(batches, signerAccount);
    };

    export const announceAll = async (
        txs: InnerTransaction[],
        signerAccount: Account,
        cosignerAccounts: Account[]
    ) => {
        const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
            txs,
            signerAccount,
            cosignerAccounts,
        );
        assert(batches.length);
        console.log(`batches.length=${batches.length}`);

        const totalFee = batches.reduce(
            (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
        );
        console.log(`totalFee=${totalFee.toString()}`);

        const errors = await symbolService.executeBatches(batches, signerAccount);
        errors?.forEach(({txHash, error}) => {
            console.error(`${txHash}: ${error}`);
        });
        assert(!errors?.length);
    };

    export const generateAssets = async () => {
        // Generate account
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { networkType } = await symbolService.getNetwork();
        const account = Account.generateNewAccount(networkType);
        console.log(
            `account.address=${account.address.plain()}\n` +
            `  .publicKey=${account.publicKey}\n` +
            `  .privateKey=${account.privateKey}\n`
        );

        // Define new mosaic
        const mosaicDefinition = await symbolService.createMosaicDefinitionTx(
            signerAccount.publicAccount,
            UInt64.fromUint(20),
            0,
            100,
        );
        await SymbolTest.doAggregateTx(mosaicDefinition.txs, signerAccount, [])
            .then((result) => {
                expect(result?.error).toBeUndefined();
            });
        const mosaicId = mosaicDefinition.mosaicId;
        console.log(`mosaicId=${mosaicId.toHex()}`);

        // Register new namespace
        const namespaceName = uuidv4();
        const namespaceTx = await symbolService.createNamespaceRegistrationTx(
            signerAccount.publicAccount,
            namespaceName,
            UInt64.fromUint(86400),
        );
        await SymbolTest.doAggregateTx([ namespaceTx ], signerAccount, [])
            .then((result) => {
                expect(result?.error).toBeUndefined();
            });
        const namespaceId = new NamespaceId(namespaceName);
        console.log(`namespaceId=${namespaceId.toHex()}`);

        return {
            account,
            mosaicId,
            namespaceId,
        };
    };

    export const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
}
