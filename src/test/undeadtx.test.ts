import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {AggregateUndeadTransaction, NecromancyService, SymbolService} from "../services";
import {
    Account,
    CosignatureSignedTransaction, InnerTransaction,
    MetadataType, MosaicId,
    PublicAccount,
    SignedTransaction,
    UInt64
} from "symbol-sdk";
import assert from "assert";
import {SymbolTest} from "./utils";


describe("AggregateUndeadTransaction", () => {
    let necromancyService: NecromancyService;
    let symbolService: SymbolService;
    let targetAccount: Account;
    let undeadTx: AggregateUndeadTransaction;
    let mosaicId: MosaicId;

    beforeAll(async () => {
        symbolService = SymbolTest.init();
        necromancyService = new NecromancyService(symbolService);

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
    }, 600000);

    const createTransactions = async (key: string, value: string = "test", message: string = "test") => {
        const { signerAccount, payerAccount } = await SymbolTest.getNamedAccounts();
        return [
            await symbolService.createMetadataTx(
                MetadataType.Account,
                signerAccount.publicAccount,
                targetAccount.publicAccount,
                undefined,
                key,
                value,
            ),
            await symbolService.createTransferTx(
                signerAccount.publicAccount,
                payerAccount.address,
                UInt64.fromUint(1000000),
                message,
            )
        ];
    };

    const announceSignedTxWithCosignatures = async (signedTx: SignedTransaction, cosignatures: CosignatureSignedTransaction[]) => {
        const { networkType } = await symbolService.getNetwork();
        const signerPubAccount = PublicAccount.createFromPublicKey(signedTx.signerPublicKey, networkType);
        await symbolService.announceTxWithCosignatures(signedTx, cosignatures);
        return (await symbolService.waitTxsFor(signerPubAccount, signedTx.hash, "confirmed")).shift();
    };

    it("Create", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        undeadTx = await necromancyService.createTx(
            4 * 24,
            await createTransactions("test1key"),
            signerAccount,
            [ targetAccount ],
            0.1,
            1,
        );

        expect(undeadTx.signatures.length).toBe(Math.ceil(4 * 24 / 5));
    }, 600000);

    it("Serialize", async () => {
        const json = undeadTx.toJSON();
        const restoredUndeadTx = AggregateUndeadTransaction.createFromJSON(json);

        expect(restoredUndeadTx).toStrictEqual(undeadTx);
    }, 600000);

    it("Retrieve TX", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const retrievedUndeadTx = await necromancyService.retrieveTx(
            await createTransactions("test1key"),
            signerAccount.publicAccount,
            undeadTx.signatures,
            undeadTx.aggregateTx.maxFee,
            undeadTx.nonce,
        );

        expect(retrievedUndeadTx.toJSON()).toStrictEqual(undeadTx.toJSON());

        undeadTx = retrievedUndeadTx;
    });

    it("Pick and cast", async () => {
        const castedTx = await necromancyService.pickAndCastTx(undeadTx);

        expect(castedTx).toBeDefined();
        // Expect picking 1st signature.
        expect(castedTx?.signature).toStrictEqual(undeadTx.signatures[0]);
        expect(castedTx?.cosignatures.length).toBe(1);

        assert(castedTx);
        const result = await announceSignedTxWithCosignatures(castedTx.signedTx, castedTx.cosignatures);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Overlapped", async () => {
        // Forward 4.5 hours
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        undeadTx = await necromancyService.createTx(
            4 * 24,
            await createTransactions("test2key"),
            signerAccount,
            [],
            0.1,
            1,
            undefined,
            4.5 * 60 * 60
        );

        const castedTx = await necromancyService.pickAndCastTx(undeadTx, [ targetAccount ]);

        expect(castedTx).toBeDefined();
        // Expect picking 2nd signature.
        expect(castedTx?.signature).toStrictEqual(undeadTx.signatures[1]);

        assert(castedTx);
        const result = await announceSignedTxWithCosignatures(castedTx.signedTx, castedTx.cosignatures);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Block duplicated announce", async () => {
        undeadTx = necromancyService.cosignTx(undeadTx, [ targetAccount ]);

        // Backward 1 hour
        const castedTx = await necromancyService.pickAndCastTx(
            undeadTx,
            [],
            60 * 60
        );

        expect(castedTx).toBeDefined();
        // Expect picking 1st signature.
        expect(castedTx?.signature).toStrictEqual(undeadTx.signatures[0]);

        assert(castedTx);
        const result = await announceSignedTxWithCosignatures(castedTx.signedTx, castedTx.cosignatures);

        // This must be failed.
        expect(result?.error).toBeDefined();
    }, 600000);

    it("Deadline too far error", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        undeadTx = await necromancyService.createTx(
            4 * 24,
            await createTransactions("test3key"),
            signerAccount,
            [],
            0.1,
            1
        );

        // Forward 10 hours
        const castedTx = await necromancyService.pickAndCastTx(undeadTx, [ targetAccount ],-10 * 60 * 60);

        expect(castedTx).toBeDefined();
        // Expect picking 3rd signature
        expect(castedTx?.signature).toStrictEqual(undeadTx.signatures[2]);

        assert(castedTx);
        const result = await announceSignedTxWithCosignatures(castedTx.signedTx, castedTx.cosignatures);

        // This must be failed.
        expect(result?.error).toBeDefined();
    }, 600000);

    it("Expired", async () => {
        // Forward 4.5 hours
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        undeadTx = await necromancyService.createTx(
            4 * 24,
            await createTransactions("test4key"),
            signerAccount,
            [],
            0.1,
            1,
            undefined,
            4 * 24 * 60 * 60 + 1
        );

        const castedTx = await necromancyService.pickAndCastTx(undeadTx, [ targetAccount ]);

        expect(castedTx).toBeDefined();
        // Expect picking 1st signature.
        expect(castedTx?.signature).toStrictEqual(undeadTx.signatures[undeadTx.signatures.length - 1]);

        assert(castedTx);
        const result = await announceSignedTxWithCosignatures(castedTx.signedTx, castedTx.cosignatures);

        // This must be failed.
        expect(result?.error).toBeDefined();
    }, 600000);

    const createManyTransactions = async (key: string, value: string) => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        return symbolService.createMetadataTx(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            key,
            value,
        );
    };

    it("Multiple batches", async () => {
        const { signerAccount: senderAccount } = await SymbolTest.getNamedAccounts();
        const txs = new Array<InnerTransaction>();

        for (let i = 0; i < 200; i++) {
            txs.push(await createManyTransactions(`test${100 + i}key`, `test${100 + i}value`));
        }

        const batches = await necromancyService.buildTxBatches(
            4 * 24,
            txs,
            senderAccount,
            [ targetAccount ],
            0.1,
            undefined,
            undefined,
            4.5 * 60 * 60,
        );

        const totalSignatures = batches.reduce((acc, curr) => acc + curr.signatures.length, 0);

        expect(batches.length).toBe(3);
        expect(totalSignatures).toBe(Math.ceil(4 * 24 / 5) * 3);

        const results = await symbolService.executeBatches(
            await necromancyService.pickAndCastTxBatches(batches),
            senderAccount
        );

        expect(results?.filter((result) => result.error).shift()).toBeUndefined();
    }, 600000);

    it("Expired multiple batches", async () => {
        const { signerAccount: senderAccount } = await SymbolTest.getNamedAccounts();
        const txs = new Array<InnerTransaction>();

        for (let i = 0; i < 200; i++) {
            txs.push(await createManyTransactions(`test${100 + i}key`, `test${100 + i}value`));
        }

        const batches = await necromancyService.buildTxBatches(
            4 * 24,
            txs,
            senderAccount,
            [ targetAccount ],
            0.1,
            undefined,
            undefined,
            4 * 24 * 60 * 60 + 1,
        );

        const totalSignatures = batches.reduce((acc, curr) => acc + curr.signatures.length, 0);

        expect(batches.length).toBe(3);
        expect(totalSignatures).toBe(Math.ceil(4 * 24 / 5) * 3);

        const results = await symbolService.executeBatches(
            await necromancyService.pickAndCastTxBatches(batches),
            senderAccount
        );

        expect(results?.filter((result) => result.error).shift()).toBeDefined();
    }, 600000);
});