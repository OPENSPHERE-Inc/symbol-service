import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {SymbolTest} from "./utils";
import {Account, InnerTransaction, Mosaic, MosaicId, UInt64} from "symbol-sdk";
import {SymbolService} from "../services";


describe("Aggregate Transaction", () => {
    let symbolService: SymbolService;
    let targetAccount: Account;
    let mosaicId: MosaicId;

    beforeAll(async () => {
        symbolService = SymbolTest.init();

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
    }, 600000);

    it("Multiple batches", async () => {
        const { signerAccount: senderAccount, payerAccount: recipientAccount } = await SymbolTest.getNamedAccounts();

        const txs = new Array<InnerTransaction>();

        for (let i = 0; i < 100; i++) {
            txs.push(await symbolService.createTransferTx(
                senderAccount.publicAccount,
                targetAccount.address,
                new Mosaic(mosaicId, UInt64.fromUint(1)),
                `test${i}message`,
            ));
        }
        for (let i = 0; i < 100; i++) {
            txs.push(await symbolService.createTransferTx(
                senderAccount.publicAccount,
                recipientAccount.address,
                UInt64.fromUint(1000000),
                `test${100 + i}message`,
            ));
        }

        const results = await SymbolTest.doAggregateTxBatches(txs, senderAccount, []);

        expect(results?.filter((result) => result.error).shift()).toBeUndefined();
    }, 6000000);
});